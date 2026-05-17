import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from 'pino';

const execFileAsync = promisify(execFile);

export interface CircleCliRunner {
  status(): Promise<{ authenticated: boolean; expiresAt?: Date }>;
  walletTransfer(args: {
    toAddress: string;
    amount: string;
    fromAddress: string;
    chain: string;
    idempotencyKey?: string;
  }): Promise<{ txHash: string; circleTxId: string }>;
  walletBalance(args: {
    address: string;
    chain: string;
  }): Promise<{ usdc: bigint }>;
  walletCreate(args: {
    testnet: boolean;
    idempotencyKey: string;
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

  async status(): Promise<{ authenticated: boolean; expiresAt?: Date }> {
    try {
      const raw = await this.exec(['wallet', 'status', '--type', 'agent', '--output', 'json']);
      const data = JSON.parse(raw);
      // TODO: Verify the exact JSON shape from `circle wallet status --output json`.
      // Conservative interpretation: if we get valid JSON back, session is active.
      return {
        authenticated: true,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      };
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
    // TODO: Verify if `circle wallet transfer` supports --idempotency-key.
    // The CLI command reference does not list this flag for transfer.
    // If not supported, idempotency is handled at the application layer
    // by checking agent_audit_log before executing.

    const raw = await this.exec(cliArgs);
    const data = JSON.parse(raw);
    // TODO: Verify exact JSON output shape of circle wallet transfer --output json
    return {
      txHash: data.txHash ?? data.transactionHash ?? '',
      circleTxId: data.id ?? data.transactionId ?? '',
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
    const data = JSON.parse(raw);
    // TODO: Verify exact JSON output shape of circle wallet balance --output json
    // Conservative: parse as string, convert to micro-USDC bigint
    const usdcStr = data.usdc ?? data.balance ?? '0';
    const parts = String(usdcStr).split('.');
    const whole = BigInt(parts[0] ?? '0') * 1_000_000n;
    const frac = parts[1] ? BigInt(parts[1].padEnd(6, '0').slice(0, 6)) : 0n;
    return { usdc: whole + frac };
  }

  async walletCreate(args: {
    testnet: boolean;
    idempotencyKey: string;
  }): Promise<{ address: string }> {
    const cliArgs = [
      'wallet', 'create',
      '--type', 'agent',
      '--idempotency-key', args.idempotencyKey,
      '--output', 'json',
    ];
    if (args.testnet) cliArgs.push('--testnet');

    const raw = await this.exec(cliArgs);
    const data = JSON.parse(raw);
    // TODO: Verify exact JSON output shape of circle wallet create --output json
    return { address: data.address ?? data.walletAddress ?? '' };
  }
}
