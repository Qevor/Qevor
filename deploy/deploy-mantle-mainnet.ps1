$ErrorActionPreference = "Stop"

$requiredGuard = "I_UNDERSTAND_MAINNET_FUNDS_ARE_REAL"
if ($env:QEVOR_ALLOW_MAINNET_DEPLOY -ne $requiredGuard) {
  throw "Refusing mainnet deployment. Set QEVOR_ALLOW_MAINNET_DEPLOY=$requiredGuard to continue."
}

$rpcUrl = if ($env:MANTLE_MAINNET_RPC_URL) { $env:MANTLE_MAINNET_RPC_URL } else { "https://rpc.mantle.xyz" }
$deployerKey = $env:MANTLE_MAINNET_DEPLOYER_PRIVATE_KEY
$executorAddress = if ($env:MANTLE_MAINNET_EXECUTOR_ADDRESS) {
  $env:MANTLE_MAINNET_EXECUTOR_ADDRESS
} else {
  $env:MANTLE_ESCROW_EXECUTOR_ADDRESS
}
$maxPaymentWei = if ($env:MANTLE_MAINNET_ESCROW_MAX_PAYMENT_WEI) {
  $env:MANTLE_MAINNET_ESCROW_MAX_PAYMENT_WEI
} else {
  "1000000000000000000"
}
$dailyLimitWei = if ($env:MANTLE_MAINNET_ESCROW_DAILY_LIMIT_WEI) {
  $env:MANTLE_MAINNET_ESCROW_DAILY_LIMIT_WEI
} else {
  "5000000000000000000"
}
$forgeBin = if ($env:FOUNDRY_FORGE_BIN) { $env:FOUNDRY_FORGE_BIN } else { "forge" }
$castBin = if ($env:FOUNDRY_CAST_BIN) {
  $env:FOUNDRY_CAST_BIN
} elseif ($forgeBin -match "forge(\.exe)?$") {
  $forgeBin -replace "forge(\.exe)?$", "cast$($Matches[1])"
} else {
  "cast"
}
$erc8004Registry = $env:MANTLE_MAINNET_ERC8004_IDENTITY_REGISTRY_ADDRESS
$erc8004AgentId = $env:MANTLE_MAINNET_ERC8004_AGENT_ID
$agentUri = if ($env:QEVOR_MAINNET_AGENT_URI) {
  $env:QEVOR_MAINNET_AGENT_URI
} else {
  "https://qevor.xyz/.well-known/erc8004/qevor-agent.json"
}
$allowUnregisteredAgent = "I_ACCEPT_UNREGISTERED_MAINNET_AGENT"

if (-not $deployerKey) {
  throw "MANTLE_MAINNET_DEPLOYER_PRIVATE_KEY is required."
}
if (-not $executorAddress) {
  throw "MANTLE_MAINNET_EXECUTOR_ADDRESS or MANTLE_ESCROW_EXECUTOR_ADDRESS is required."
}
if ($executorAddress -notmatch "^0x[a-fA-F0-9]{40}$") {
  throw "Executor address must be a 0x address."
}
if ($env:QEVOR_ALLOW_UNREGISTERED_MAINNET_AGENT -ne $allowUnregisteredAgent) {
  if (-not $erc8004Registry) {
    throw "MANTLE_MAINNET_ERC8004_IDENTITY_REGISTRY_ADDRESS is required. Qevor mainnet agent must link to Mantle ERC-8004."
  }
  if ($erc8004Registry -notmatch "^0x[a-fA-F0-9]{40}$") {
    throw "MANTLE_MAINNET_ERC8004_IDENTITY_REGISTRY_ADDRESS must be a 0x address."
  }
  if (-not $erc8004AgentId) {
    throw "MANTLE_MAINNET_ERC8004_AGENT_ID is required. Register the Qevor agent in Mantle ERC-8004 first, then rerun this deploy."
  }
  if ($erc8004AgentId -notmatch "^[0-9]+$") {
    throw "MANTLE_MAINNET_ERC8004_AGENT_ID must be a numeric agent id."
  }
}

$chainIdPayload = '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
$chainId = (Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType "application/json" -Body $chainIdPayload).result
if ($chainId -ne "0x1388") {
  throw "RPC did not return Mantle mainnet chain id 0x1388. Got $chainId."
}

Write-Host "Deploying QevorAgentEscrow to Mantle mainnet (chain id 5000)."
Write-Host "Executor: $executorAddress"
Write-Host "Max payment wei: $maxPaymentWei"
Write-Host "Daily limit wei: $dailyLimitWei"
if ($erc8004Registry -and $erc8004AgentId) {
  Write-Host "ERC-8004 registry: $erc8004Registry"
  Write-Host "ERC-8004 agent id: $erc8004AgentId"
  Write-Host "Agent URI: $agentUri"
}

$createOutput = & $forgeBin create contracts/QevorAgentEscrow.sol:QevorAgentEscrow `
  --rpc-url $rpcUrl `
  --private-key $deployerKey `
  --constructor-args $executorAddress $maxPaymentWei $dailyLimitWei

$createOutput | ForEach-Object { Write-Host $_ }
$createText = $createOutput -join "`n"
if ($createText -notmatch "Deployed to:\s*(0x[a-fA-F0-9]{40})") {
  throw "Could not parse deployed escrow address from forge output."
}

$escrowAddress = $Matches[1]
Write-Host "QevorAgentEscrow deployed: $escrowAddress"

if ($erc8004Registry -and $erc8004AgentId) {
  Write-Host "Linking escrow to Mantle ERC-8004 identity."
  & $castBin send $escrowAddress "setAgentIdentity(address,uint256,string)" $erc8004Registry $erc8004AgentId $agentUri `
    --rpc-url $rpcUrl `
    --private-key $deployerKey
  Write-Host "Qevor mainnet agent identity linked."
} else {
  Write-Warning "Escrow deployed without ERC-8004 identity because QEVOR_ALLOW_UNREGISTERED_MAINNET_AGENT was explicitly set."
}
