export interface RailTransferResult {
  txHash: string;
  circleTxId?: string;
  metadata?: Record<string, unknown>;
}

export interface RailRunner {
  status(): Promise<{ authenticated: boolean; expiresAt?: Date; reason?: string }>;
  walletTransfer(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    chain: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RailTransferResult>;
  walletBalance(args: {
    address: string;
    chain: string;
  }): Promise<{ usdc: bigint }>;
  walletCreate(args: {
    testnet: boolean;
    idempotencyKey: string;
    chain?: string;
  }): Promise<{ address: string }>;
  recordDecision?(args: {
    decisionId: string;
    paymentId: string;
    recipientAddress: string;
    amount: string;
    outcome: 'blocked' | 'cosign_required' | 'failed';
    reason: string;
    chain: string;
  }): Promise<{ txHash: string; metadata?: Record<string, unknown> }>;
}
