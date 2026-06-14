import { spawnSync } from 'node:child_process';

interface QevorByrealPayload {
  chain?: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: string;
  batchId?: string;
  paymentId?: string;
  policyDecision?: 'execute' | 'cosign_required' | 'blocked';
}

interface PreflightResponse {
  allowed: boolean;
  reason: string;
  checks: Record<string, unknown>;
}

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

void main();

async function main() {
  const raw = await readStdin();
  const payload = parsePayload(raw);
  const response = payload
    ? evaluatePayload(payload)
    : deny('Invalid preflight payload JSON', { rawLength: raw.length });

  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function evaluatePayload(payload: QevorByrealPayload): PreflightResponse {
  const chain = normalizeChain(payload.chain);
  const amount = Number(payload.amount);
  const maxAmount = Number(process.env.QEVOR_BYREAL_MAX_PREFLIGHT_MNT ?? '100');
  const requireByrealCli = process.env.QEVOR_BYREAL_REQUIRE_CLI === '1';
  const byrealCli = getByrealCliStatus();

  const checks = {
    chain,
    fromAddress: maskAddress(payload.fromAddress),
    toAddress: maskAddress(payload.toAddress),
    amount: payload.amount ?? null,
    maxAmount,
    policyDecision: payload.policyDecision ?? null,
    batchId: payload.batchId ?? null,
    paymentId: payload.paymentId ?? null,
    byrealCli,
  };

  if (chain !== 'MANTLE-SEPOLIA') {
    return deny('Only Mantle Sepolia agent payments are allowed by this Byreal preflight wrapper.', checks);
  }
  if (!payload.fromAddress || !EVM_ADDRESS.test(payload.fromAddress)) {
    return deny('Invalid Mantle sender address.', checks);
  }
  if (!payload.toAddress || !EVM_ADDRESS.test(payload.toAddress)) {
    return deny('Invalid Mantle recipient address.', checks);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return deny('Payment amount must be greater than zero.', checks);
  }
  if (Number.isFinite(maxAmount) && amount > maxAmount) {
    return deny(`Payment amount exceeds Byreal preflight limit of ${maxAmount} MNT.`, checks);
  }
  if (payload.policyDecision === 'blocked') {
    return deny('Qevor policy already blocked this payment.', checks);
  }
  if (requireByrealCli && !byrealCli.available) {
    return deny('Byreal CLI is required but not available on this server.', checks);
  }

  return {
    allowed: true,
    reason: byrealCli.available
      ? 'Byreal-compatible Mantle preflight accepted the Qevor payment operation.'
      : 'Byreal-compatible Mantle preflight accepted the operation; install byreal-cli to expose Byreal skill metadata.',
    checks,
  };
}

function getByrealCliStatus() {
  const bin = process.env.BYREAL_SOLANA_CLI_BIN || 'byreal-cli';
  const result = spawnSync(bin, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });

  return {
    bin,
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : null,
    note: 'Official Byreal CLI is Solana-focused; Qevor uses this wrapper for Mantle payment preflight.',
  };
}

function parsePayload(raw: string): QevorByrealPayload | null {
  try {
    const parsed = JSON.parse(raw || '{}') as QevorByrealPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeChain(chain?: string) {
  const value = (chain ?? '').trim().toUpperCase();
  if (value === 'MANTLE_SEPOLIA' || value === 'MANTLE' || value === '5003') return 'MANTLE-SEPOLIA';
  return value;
}

function maskAddress(address?: string) {
  if (!address) return null;
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function deny(reason: string, checks: Record<string, unknown>): PreflightResponse {
  return { allowed: false, reason, checks };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  });
}
