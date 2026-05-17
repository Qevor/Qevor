// Policy engine — duplicated from src/lib/agents/policy-engine.ts
// Keep in sync. TODO: Extract to a shared package.

export interface PolicyFields {
  max_per_tx_usdc: number | null;
  daily_cap_usdc: number | null;
  weekly_cap_usdc: number | null;
  monthly_cap_usdc: number | null;
  allowlist_addresses: string[];
  blocklist_addresses: string[];
  allowlist_usernames: string[];
  blocklist_usernames: string[];
  allowed_hours_utc: string | null;
  cosign_threshold_usdc: number | null;
}

export type Decision =
  | { outcome: 'execute' }
  | { outcome: 'blocked'; reason: string }
  | { outcome: 'cosign_required'; reason: string };

export type EvaluationContext = {
  now: Date;
  todaySpendMicroUsdc: bigint;
  weekSpendMicroUsdc: bigint;
  monthSpendMicroUsdc: bigint;
  resolvedUsername: string | null;
};

function toMicro(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1_000_000));
}

function parseHoursRange(range: string): { from: number; to: number } | null {
  const match = range.match(/\[(\d+),(\d+)\)/);
  if (!match) return null;
  return { from: parseInt(match[1]), to: parseInt(match[2]) };
}

function isInHoursRange(hour: number, from: number, to: number): boolean {
  if (from <= to) return hour >= from && hour < to;
  return hour >= from || hour < to;
}

export function evaluate(
  policy: PolicyFields,
  payment: { recipientAddress: string; amountMicroUsdc: bigint },
  ctx: EvaluationContext,
): Decision {
  const addr = payment.recipientAddress.toLowerCase();
  const username = ctx.resolvedUsername?.toLowerCase() ?? null;

  if (policy.blocklist_addresses.length > 0) {
    if (policy.blocklist_addresses.some((a) => a.toLowerCase() === addr)) {
      return { outcome: 'blocked', reason: 'recipient_address_blocklisted' };
    }
  }

  if (policy.blocklist_usernames.length > 0 && username) {
    if (policy.blocklist_usernames.some((u) => u.toLowerCase() === username)) {
      return { outcome: 'blocked', reason: 'recipient_username_blocklisted' };
    }
  }

  if (policy.allowed_hours_utc) {
    const range = parseHoursRange(policy.allowed_hours_utc);
    if (range) {
      const hour = ctx.now.getUTCHours();
      if (!isInHoursRange(hour, range.from, range.to)) {
        return { outcome: 'blocked', reason: 'outside_allowed_hours' };
      }
    }
  }

  if (policy.allowlist_addresses.length > 0) {
    if (!policy.allowlist_addresses.some((a) => a.toLowerCase() === addr)) {
      return { outcome: 'blocked', reason: 'recipient_address_not_in_allowlist' };
    }
  }

  if (policy.allowlist_usernames.length > 0) {
    if (!username || !policy.allowlist_usernames.some((u) => u.toLowerCase() === username)) {
      return { outcome: 'blocked', reason: 'recipient_username_not_in_allowlist' };
    }
  }

  if (policy.max_per_tx_usdc != null) {
    if (payment.amountMicroUsdc > toMicro(policy.max_per_tx_usdc)) {
      return { outcome: 'blocked', reason: 'per_tx_cap_exceeded' };
    }
  }

  if (policy.daily_cap_usdc != null) {
    if (ctx.todaySpendMicroUsdc + payment.amountMicroUsdc > toMicro(policy.daily_cap_usdc)) {
      return { outcome: 'blocked', reason: 'daily_cap_exceeded' };
    }
  }

  if (policy.weekly_cap_usdc != null) {
    if (ctx.weekSpendMicroUsdc + payment.amountMicroUsdc > toMicro(policy.weekly_cap_usdc)) {
      return { outcome: 'blocked', reason: 'weekly_cap_exceeded' };
    }
  }

  if (policy.monthly_cap_usdc != null) {
    if (ctx.monthSpendMicroUsdc + payment.amountMicroUsdc > toMicro(policy.monthly_cap_usdc)) {
      return { outcome: 'blocked', reason: 'monthly_cap_exceeded' };
    }
  }

  if (policy.cosign_threshold_usdc != null) {
    if (payment.amountMicroUsdc > toMicro(policy.cosign_threshold_usdc)) {
      return { outcome: 'cosign_required', reason: 'exceeds_cosign_threshold' };
    }
  }

  return { outcome: 'execute' };
}
