import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  keccak256,
  parseEther,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Logger } from 'pino';
import type { RailRunner } from './rail-runner.js';
import { MANTLE_SEPOLIA_AGENT_CHAIN } from './chain-support.js';
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

const MICRO = 1_000_000n;
const qevorAgentEscrowAbi = [
  {
    type: 'function',
    name: 'executePayment',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
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
    try {
      this.getAccount();
      await this.publicClient().getBlockNumber();
      return { authenticated: true };
    } catch (err) {
      return {
        authenticated: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async walletCreate(): Promise<{ address: string }> {
    return { address: this.escrowContractAddress() ?? this.getAccount().address };
  }

  async walletBalance(args: { address: string }): Promise<{ usdc: bigint }> {
    if (!isAddress(args.address)) throw new Error('Invalid Mantle address');
    const balance = await this.publicClient().getBalance({ address: args.address });
    const asMnt = Number(formatEther(balance));
    return { usdc: BigInt(Math.round(asMnt * Number(MICRO))) };
  }

  async walletTransfer(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    chain: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ txHash: string; metadata: Record<string, unknown> }> {
    if (args.chain !== MANTLE_SEPOLIA_AGENT_CHAIN) {
      throw new Error(`Mantle runner cannot execute chain ${args.chain}`);
    }
    if (!isAddress(args.toAddress)) throw new Error('Invalid recipient address');

    const account = this.getAccount();
    const escrowContract = this.escrowContractAddress();
    const expectedFromAddress = escrowContract ?? account.address;
    if (args.fromAddress.toLowerCase() !== expectedFromAddress.toLowerCase()) {
      throw new Error('Mantle executor escrow address is not configured for this agent wallet');
    }

    const preflight = await this.byreal.preflight({
      chain: args.chain,
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
      chain: mantleSepolia,
      transport: http(this.rpcUrl()),
    });

    const amountWei = parseEther(args.amount);
    const paymentId = this.paymentIdFor(args);
    const txHash = escrowContract
      ? await walletClient.writeContract({
          address: escrowContract as `0x${string}`,
          abi: qevorAgentEscrowAbi,
          functionName: 'executePayment',
          args: [paymentId, args.toAddress as `0x${string}`, amountWei],
        })
      : await walletClient.sendTransaction({
          to: args.toAddress,
          value: amountWei,
        });

    await this.publicClient().waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      metadata: {
        rail: escrowContract ? 'mantle-contract-escrow' : 'mantle-native',
        escrow_contract: escrowContract ?? null,
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
    if (args.chain !== MANTLE_SEPOLIA_AGENT_CHAIN) {
      throw new Error(`Mantle runner cannot record a decision for chain ${args.chain}`);
    }
    if (!isAddress(args.recipientAddress)) throw new Error('Invalid decision recipient address');

    const escrowContract = this.escrowContractAddress();
    if (!escrowContract) {
      throw new Error('MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS is required to record decisions');
    }

    const account = this.getAccount();
    const walletClient = createWalletClient({
      account,
      chain: mantleSepolia,
      transport: http(this.rpcUrl()),
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

    await this.publicClient().waitForTransactionReceipt({ hash: txHash });
    return {
      txHash,
      metadata: {
        rail: 'mantle-contract-decision',
        escrow_contract: escrowContract,
        outcome: args.outcome,
      },
    };
  }

  private publicClient() {
    return createPublicClient({
      chain: mantleSepolia,
      transport: http(this.rpcUrl()),
    });
  }

  private rpcUrl(): string {
    return process.env.MANTLE_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.mantle.xyz';
  }

  private escrowContractAddress(): `0x${string}` | null {
    const address = process.env.MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS;
    if (!address) return null;
    if (!isAddress(address)) {
      throw new Error('MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS is not a valid EVM address');
    }
    return address as `0x${string}`;
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

  private getAccount() {
    const privateKey = process.env.MANTLE_AGENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('MANTLE_AGENT_PRIVATE_KEY is not configured');
    }
    const normalizedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    return privateKeyToAccount(normalizedPrivateKey as `0x${string}`);
  }
}
