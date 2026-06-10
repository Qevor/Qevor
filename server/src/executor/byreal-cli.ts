import { spawn } from 'node:child_process';
import type { Logger } from 'pino';

export interface ByrealPreflightPayload {
  chain: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  batchId?: string;
  paymentId?: string;
  policyDecision: 'execute' | 'cosign_required' | 'blocked';
}

export interface ByrealPreflightResult {
  allowed: boolean;
  reason?: string;
  raw?: string;
  skipped?: boolean;
}

export class ByrealCliRunner {
  constructor(private readonly log: Logger) {}

  async status(): Promise<{ available: boolean; reason?: string }> {
    const bin = process.env.BYREAL_CLI_BIN;
    if (!bin) {
      return { available: false, reason: 'BYREAL_CLI_BIN is not configured' };
    }

    try {
      await this.exec(bin, ['--version'], '{}', 10_000);
      return { available: true };
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async preflight(payload: ByrealPreflightPayload): Promise<ByrealPreflightResult> {
    const bin = process.env.BYREAL_CLI_BIN;
    const args = splitArgs(process.env.BYREAL_PREFLIGHT_ARGS);

    if (!bin || args.length === 0) {
      return { allowed: true, skipped: true, reason: 'byreal_preflight_not_configured' };
    }

    try {
      const raw = await this.exec(bin, args, JSON.stringify(payload), 30_000);
      const trimmed = raw.trim();
      if (!trimmed) return { allowed: true, raw };

      const parsed = JSON.parse(trimmed) as { allowed?: boolean; reason?: string };
      return {
        allowed: parsed.allowed !== false,
        reason: parsed.reason,
        raw,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.log.error({ err: reason }, 'Byreal preflight failed');
      return { allowed: false, reason: `byreal_preflight_failed: ${reason}` };
    }
  }

  private exec(bin: string, args: string[], input: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Byreal CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr.trim() || `Byreal CLI exited with code ${code}`));
        }
      });

      child.stdin.end(input);
    });
  }
}

function splitArgs(value?: string): string[] {
  if (!value) return [];
  return value.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? [];
}
