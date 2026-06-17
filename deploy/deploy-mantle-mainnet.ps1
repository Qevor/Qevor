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

if (-not $deployerKey) {
  throw "MANTLE_MAINNET_DEPLOYER_PRIVATE_KEY is required."
}
if (-not $executorAddress) {
  throw "MANTLE_MAINNET_EXECUTOR_ADDRESS or MANTLE_ESCROW_EXECUTOR_ADDRESS is required."
}
if ($executorAddress -notmatch "^0x[a-fA-F0-9]{40}$") {
  throw "Executor address must be a 0x address."
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

& $forgeBin create contracts/QevorAgentEscrow.sol:QevorAgentEscrow `
  --rpc-url $rpcUrl `
  --private-key $deployerKey `
  --constructor-args $executorAddress $maxPaymentWei $dailyLimitWei
