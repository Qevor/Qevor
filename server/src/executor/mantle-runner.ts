import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  keccak256,
  parseEther,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Logger } from 'pino';
import type { RailRunner } from './rail-runner.js';
import {
  MANTLE_MAINNET_AGENT_CHAIN,
  MANTLE_SEPOLIA_AGENT_CHAIN,
  escrowContractAddressForAgentChain,
  isMantleAgentChain,
  isMantleMainnetAgentChain,
  normalizeAgentChain,
} from './chain-support.js';
import { ByrealCliRunner } from './byreal-cli.js';

const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Mantle Sepolia Explorer', url: 'https://explorer.sepolia.mantle.xyz' },
  },
  testnet: true,
});

const mantleMainnet = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Mantle Explorer', url: 'https://explorer.mantle.xyz' },
  },
  testnet: false,
});

const MICRO = 1_000_000n;
const qevorAgentEscrowAbi = [
  {
    type: 'function',
    name: 'executePayment',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'account', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'recordDecision',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'decisionId', type: 'bytes32' },
      { name: 'paymentId', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'outcome', type: 'uint8' },
      { name: 'reasonHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

export class MantleNativeRunner implements RailRunner {
  private readonly byreal: ByrealCliRunner;

  constructor(private readonly log: Logger) {
    this.byreal = new ByrealCliRunner(log);
  }

  async status(): Promise<{ authenticated: boolean; reason?: string }> {
    const failures: string[] = [];

    for (const chain of [MANTLE_SEPOLIA_AGENT_CHAIN, MANTLE_MAINNET_AGENT_CHAIN]) {
      try {
        this.getAccount(chain);
        await this.publicClient(chain).getBlockNumber();
        return { authenticated: true };
      } catch (err) {
        failures.push(`${chain}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      authenticated: false,
      reason: failures.join('; '),
    };
  }

  async walletCreate(args: { testnet: boolean; idempotencyKey: string; chain?: string }): Promise<{ address: string }> {
    const chain = normalizeAgentChain(args.chain);
    return { address: this.escrowContractAddress(chain) ?? this.getAccount(chain).address };
  }

  async walletBalance(args: { address: string; chain?: string; ownerAddress?: string }): Promise<{ usdc: bigint }> {
    if (!isAddress(args.address)) throw new Error('Invalid Mantle address');
    const chain = normalizeAgentChain(args.chain);
    const escrowContract = this.escrowContractAddress(chain);
    const publicClient = this.publicClient(chain);
    const useScopedBalance =
      escrowContract &&
      args.address.toLowerCase() === escrowContract.toLowerCase() &&
      args.ownerAddress &&
      isAddress(args.ownerAddress);
    const balance = useScopedBalance
      ? await publicClient.readContract({
          address: escrowContract,
          abi: qevorAgentEscrowAbi,
          functionName: 'balanceOf',
          args: [args.ownerAddress as `0x${string}`],
        })
      : await publicClient.getBalance({ address: args.address });

    return { usdc: (balance * MICRO) / 10n ** 18n };
  }

  async walletTransfer(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    chain: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ txHash: string; metadata: Record<string, unknown> }> {
    const chain = normalizeAgentChain(args.chain);
    if (!isMantleAgentChain(chain)) {
      throw new Error(`Mantle runner cannot execute chain ${args.chain}`);
    }
    if (!isAddress(args.toAddress)) throw new Error('Invalid recipient address');

    const account = this.getAccount(chain);
    const escrowContract = this.escrowContractAddress(chain);
    const expectedFromAddress = escrowContract ?? account.address;
    if (args.fromAddress.toLowerCase() !== expectedFromAddress.toLowerCase()) {
      throw new Error('Mantle executor escrow address is not configured for this agent wallet');
    }
    const ownerAddress = escrowContract ? this.ownerAddressFor(args) : null;

    const preflight = await this.byreal.preflight({
      chain,
      fromAddress: args.fromAddress,
      toAddress: args.toAddress,
      amount: args.amount,
      batchId: typeof args.metadata?.batchId === 'string' ? args.metadata.batchId : undefined,
      paymentId: typeof args.metadata?.paymentId === 'string' ? args.metadata.paymentId : undefined,
      policyDecision: 'execute',
    });

    if (!preflight.allowed) {
      throw new Error(preflight.reason ?? 'Byreal preflight blocked transfer');
    }

    const walletClient = createWalletClient({
      account,
      chain: this.viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });

    const amountWei = parseEther(args.amount);
    const paymentId = this.paymentIdFor(args);
    const txHash = escrowContract
      ? await walletClient.writeContract({
          address: escrowContract as `0x${string}`,
          abi: qevorAgentEscrowAbi,
          functionName: 'executePayment',
          args: [paymentId, ownerAddress!, args.toAddress as `0x${string}`, amountWei],
        })
      : await walletClient.sendTransaction({
          to: args.toAddress,
          value: amountWei,
        });

    await this.publicClient(chain).waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      metadata: {
        rail: escrowContract ? 'mantle-contract-escrow' : 'mantle-native',
        agent_chain: chain,
        escrow_contract: escrowContract ?? null,
        escrow_owner: ownerAddress,
        payment_id: paymentId,
        byreal: {
          skipped: preflight.skipped === true,
          reason: preflight.reason ?? null,
        },
      },
    };
  }

  async recordDecision(args: {
    decisionId: string;
    paymentId: string;
    recipientAddress: string;
    amount: string;
    outcome: 'blocked' | 'cosign_required' | 'failed';
    reason: string;
    chain: string;
  }): Promise<{ txHash: string; metadata: Record<string, unknown> }> {
    const chain = normalizeAgentChain(args.chain);
    if (!isMantleAgentChain(chain)) {
      throw new Error(`Mantle runner cannot record a decision for chain ${args.chain}`);
    }
    if (!isAddress(args.recipientAddress)) throw new Error('Invalid decision recipient address');

    const escrowContract = this.escrowContractAddress(chain);
    if (!escrowContract) {
      throw new Error(`${this.escrowEnvName(chain)} is required to record decisions`);
    }

    const account = this.getAccount(chain);
    const walletClient = createWalletClient({
      account,
      chain: this.viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });
    const outcomes = {
      blocked: 0,
      cosign_required: 1,
      failed: 2,
    } as const;

    const txHash = await walletClient.writeContract({
      address: escrowContract,
      abi: qevorAgentEscrowAbi,
      functionName: 'recordDecision',
      args: [
        keccak256(stringToHex(args.decisionId)),
        keccak256(stringToHex(args.paymentId)),
        args.recipientAddress as `0x${string}`,
        parseEther(args.amount),
        outcomes[args.outcome],
        keccak256(stringToHex(args.reason)),
      ],
    });

    await this.publicClient(chain).waitForTransactionReceipt({ hash: txHash });
    return {
      txHash,
      metadata: {
        rail: 'mantle-contract-decision',
        agent_chain: chain,
        escrow_contract: escrowContract,
        outcome: args.outcome,
      },
    };
  }

  private publicClient(agentChain: string) {
    const chain = normalizeAgentChain(agentChain);
    return createPublicClient({
      chain: this.viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });
  }

  private viemChain(agentChain: string) {
    return isMantleMainnetAgentChain(agentChain) ? mantleMainnet : mantleSepolia;
  }

  private rpcUrl(agentChain: string): string {
    if (isMantleMainnetAgentChain(agentChain)) {
      return process.env.MANTLE_MAINNET_RPC_URL ?? 'https://rpc.mantle.xyz';
    }
    return process.env.MANTLE_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.mantle.xyz';
  }

  private escrowContractAddress(agentChain: string): `0x${string}` | null {
    const address = escrowContractAddressForAgentChain(agentChain);
    if (!address) return null;
    if (!isAddress(address)) {
      throw new Error(`${this.escrowEnvName(agentChain)} is not a valid EVM address`);
    }
    return address as `0x${string}`;
  }

  private escrowEnvName(agentChain: string): string {
    return isMantleMainnetAgentChain(agentChain)
      ? 'MANTLE_MAINNET_AGENT_ESCROW_CONTRACT_ADDRESS'
      : 'MANTLE_SEPOLIA_AGENT_ESCROW_CONTRACT_ADDRESS or MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS';
  }

  private paymentIdFor(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): `0x${string}` {
    const id =
      typeof args.metadata?.paymentId === 'string'
        ? args.metadata.paymentId
        : args.idempotencyKey ?? `${args.fromAddress}:${args.toAddress}:${args.amount}`;
    return keccak256(stringToHex(id));
  }

  private ownerAddressFor(args: { metadata?: Record<string, unknown> }): `0x${string}` {
    const ownerAddress =
      typeof args.metadata?.profileWallet === 'string'
        ? args.metadata.profileWallet
        : typeof args.metadata?.ownerAddress === 'string'
          ? args.metadata.ownerAddress
          : null;

    if (!ownerAddress || !isAddress(ownerAddress)) {
      throw new Error('Mantle escrow execution requires a valid owner wallet in metadata.profileWallet');
    }
    return ownerAddress as `0x${string}`;
  }

  private getAccount(agentChain: string) {
    const privateKey = isMantleMainnetAgentChain(agentChain)
      ? process.env.MANTLE_MAINNET_AGENT_PRIVATE_KEY ?? process.env.MANTLE_AGENT_PRIVATE_KEY
      : process.env.MANTLE_SEPOLIA_AGENT_PRIVATE_KEY ?? process.env.MANTLE_AGENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(`${this.privateKeyEnvName(agentChain)} is not configured`);
    }
    const normalizedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    return privateKeyToAccount(normalizedPrivateKey as `0x${string}`);
  }

  private privateKeyEnvName(agentChain: string): string {
    return isMantleMainnetAgentChain(agentChain)
      ? 'MANTLE_MAINNET_AGENT_PRIVATE_KEY or MANTLE_AGENT_PRIVATE_KEY'
      : 'MANTLE_SEPOLIA_AGENT_PRIVATE_KEY or MANTLE_AGENT_PRIVATE_KEY';
  }
}
