import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from 'pino';
import type { RailRunner } from './rail-runner.js';

const execFileAsync = promisify(execFile);

export interface CircleCliRunner extends RailRunner {
  status(): Promise<{ authenticated: boolean; expiresAt?: Date; reason?: string }>;
  walletTransfer(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    chain: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ txHash: string; circleTxId: string }>;
  walletBalance(args: {
    address: string;
    chain: string;
  }): Promise<{ usdc: bigint }>;
  walletCreate(args: {
    testnet: boolean;
    idempotencyKey: string;
    chain?: string;
  }): Promise<{ address: string }>;
}

export class RealCircleCliRunner implements CircleCliRunner {
  private log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  private async exec(args: string[]): Promise<string> {
    this.log.debug({ args }, 'circle CLI call');
    try {
      const { stdout } = await execFileAsync('circle', args, {
        timeout: 30_000,
      });
      return stdout;
    } catch (err: unknown) {
      const error = err as { stderr?: string; message?: string };
      this.log.error({ args, stderr: error.stderr }, 'circle CLI error');
      throw new Error(error.stderr ?? error.message ?? 'circle CLI failed');
    }
  }

  async status(): Promise<{ authenticated: boolean; expiresAt?: Date; reason?: string }> {
    try {
      const raw = await this.exec(['wallet', 'status', '--type', 'agent', '--output', 'json']);
      const parsed = JSON.parse(raw);
      const body = parsed.data ?? parsed;
      // Real shape: { data: { type, email, testnet: { tokenStatus, expiresIn }, mainnet: { ... } } }
      // We're testnet-first; consider authenticated if either side is VALID.
      const tValid = body.testnet?.tokenStatus === 'VALID';
      const mValid = body.mainnet?.tokenStatus === 'VALID';
      return { authenticated: tValid || mValid };
    } catch {
      return { authenticated: false };
    }
  }

  async walletTransfer(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    chain: string;
    idempotencyKey?: string;
  }): Promise<{ txHash: string; circleTxId: string }> {
    const cliArgs = [
      'wallet', 'transfer', args.toAddress,
      '--amount', args.amount,
      '--address', args.fromAddress,
      '--chain', args.chain,
      '--output', 'json',
    ];
    if (args.idempotencyKey) {
      cliArgs.push('--idempotency-key', args.idempotencyKey);
    }

    const raw = await this.exec(cliArgs);
    const parsed = JSON.parse(raw);
    const body = parsed.data ?? parsed;
    // Agent-wallet transfers return a transactionId; the on-chain txHash
    // may be available immediately or fill in after settlement.
    return {
      txHash: body.txHash ?? body.transactionHash ?? body.hash ?? '',
      circleTxId: body.id ?? body.transactionId ?? '',
    };
  }

  async walletBalance(args: {
    address: string;
    chain: string;
  }): Promise<{ usdc: bigint }> {
    const raw = await this.exec([
      'wallet', 'balance',
      '--address', args.address,
      '--chain', args.chain,
      '--output', 'json',
    ]);
    const parsed = JSON.parse(raw);
    // Real shape: { data: { balances: [{ amount: "5", token: { symbol, decimals, isNative } }] } }
    const balances: Array<{ amount: string; token: { symbol?: string } }> =
      parsed.data?.balances ?? parsed.balances ?? [];
    const usdcEntry = balances.find((b) => b.token?.symbol?.toUpperCase() === 'USDC');
    const usdcStr = String(usdcEntry?.amount ?? '0');
    // The CLI returns the amount in USDC units (e.g. "5", "5.123"),
    // not raw token integers. Convert to bigint micro-USDC for policy comparison.
    const parts = usdcStr.split('.');
    const whole = BigInt(parts[0] ?? '0') * 1_000_000n;
    const frac = parts[1] ? BigInt(parts[1].padEnd(6, '0').slice(0, 6)) : 0n;
    return { usdc: whole + frac };
  }

  async walletCreate(args: {
    testnet: boolean;
    idempotencyKey: string;
  }): Promise<{ address: string }> {
    // Circle CLI v0.0.3 `wallet create` has no --testnet flag; the active
    // session (login --testnet vs without) determines the network.
    const cliArgs = [
      'wallet', 'create',
      '--type', 'agent',
      '--idempotency-key', args.idempotencyKey,
      '--output', 'json',
    ];
    void args.testnet;
    const raw = await this.exec(cliArgs);
    const parsed = JSON.parse(raw);
    const body = parsed.data ?? parsed;
    // Shape candidates: { data: { address } } | { data: { wallet: { address } } } | { data: { wallets: [{ address }] } }
    const address: string =
      body.address ??
      body.wallet?.address ??
      body.wallets?.[0]?.address ??
      '';
    return { address };
  }
}
