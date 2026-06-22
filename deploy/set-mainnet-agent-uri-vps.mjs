import fs from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const artifactPath = process.env.QEVOR_ESCROW_ARTIFACT ?? "/tmp/qevor-agent-escrow-artifact.json";
const rpcUrl = process.env.MANTLE_MAINNET_RPC_URL ?? "https://rpc.mantle.xyz";
const escrowAddress = process.env.MANTLE_MAINNET_AGENT_ESCROW_CONTRACT_ADDRESS;
const agentUri = process.env.QEVOR_MAINNET_AGENT_URI ?? "https://qevor.xyz/.well-known/erc8004/qevor-agent.json";

function loadEnv(paths) {
  const vars = {};
  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || line.trim().startsWith("#")) continue;
      vars[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return vars;
}

const env = loadEnv(["server/.env", ".env.local"]);
const privateKey = process.env.MANTLE_MAINNET_AGENT_PRIVATE_KEY ?? env.MANTLE_MAINNET_AGENT_PRIVATE_KEY ?? env.MANTLE_AGENT_PRIVATE_KEY;
const targetEscrow = escrowAddress ?? env.MANTLE_MAINNET_AGENT_ESCROW_CONTRACT_ADDRESS;

if (!privateKey) throw new Error("Missing MANTLE_MAINNET_AGENT_PRIVATE_KEY or MANTLE_AGENT_PRIVATE_KEY.");
if (!targetEscrow) throw new Error("Missing MANTLE_MAINNET_AGENT_ESCROW_CONTRACT_ADDRESS.");

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abi = artifact.abi;
const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const chain = {
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

const currentIdentity = await publicClient.readContract({
  address: targetEscrow,
  abi,
  functionName: "agentIdentity",
});

if (currentIdentity?.[2] === agentUri) {
  console.log(`AgentURIAlreadySet=${agentUri}`);
  process.exit(0);
}

const hash = await walletClient.writeContract({
  address: targetEscrow,
  abi,
  functionName: "setAgentURI",
  args: [agentUri],
});

console.log(`SetAgentURITx=${hash}`);
await publicClient.waitForTransactionReceipt({ hash });

const updatedIdentity = await publicClient.readContract({
  address: targetEscrow,
  abi,
  functionName: "agentIdentity",
});

console.log(`AgentURI=${updatedIdentity[2]}`);
