import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const artifactPath = process.env.QEVOR_ESCROW_ARTIFACT ?? "/tmp/qevor-agent-escrow-artifact.json";
const rpcUrl = process.env.MANTLE_MAINNET_RPC_URL ?? "https://rpc.mantle.xyz";
const executorPid = process.env.QEVOR_EXECUTOR_PID;

if (!executorPid) {
  throw new Error("QEVOR_EXECUTOR_PID is required.");
}

const mantle = {
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

function readAgentKeyFromProcess(pid) {
  const environ = readFileSync(`/proc/${pid}/environ`, "utf8");
  const vars = Object.fromEntries(
    environ
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const i = entry.indexOf("=");
        return [entry.slice(0, i), entry.slice(i + 1)];
      }),
  );

  return vars.MANTLE_MAINNET_AGENT_PRIVATE_KEY ?? vars.MANTLE_AGENT_PRIVATE_KEY;
}

const privateKey = readAgentKeyFromProcess(executorPid);

if (!privateKey) {
  throw new Error("No Mantle agent private key found in qevor-executor environment.");
}

const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
const account = privateKeyToAccount(normalizedKey);
const publicClient = createPublicClient({ chain: mantle, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantle, transport: http(rpcUrl) });
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const bytecode = typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;

if (!bytecode || bytecode === "0x") {
  throw new Error("Compiled escrow bytecode is missing.");
}

const chainId = await publicClient.getChainId();
if (chainId !== mantle.id) {
  throw new Error(`Wrong chain. Expected Mantle mainnet 5000, got ${chainId}.`);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`DeployerAddress=${account.address}`);
console.log(`DeployerBalanceMNT=${formatEther(balance)}`);

if (balance < parseEther("0.05")) {
  console.log("INSUFFICIENT_MAINNET_GAS=true");
  process.exit(2);
}

const maxPaymentWei = parseEther(process.env.QEVOR_MAINNET_MAX_PAYMENT_MNT ?? "1");
const dailyLimitWei = parseEther(process.env.QEVOR_MAINNET_DAILY_LIMIT_MNT ?? "5");
const deployGas = BigInt(process.env.QEVOR_MAINNET_DEPLOY_GAS ?? "6500000");

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode,
  args: [account.address, maxPaymentWei, dailyLimitWei],
  gas: deployGas,
});

console.log(`DeployTx=${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error(`Deployment failed: ${hash}`);
}

console.log(`EscrowAddress=${receipt.contractAddress}`);
