import { describe, it, expect } from 'vitest';
import { evaluate, type PolicyFields, type EvaluationContext } from './policy-engine';

const MICRO = 1_000_000n;

function makePolicy(overrides: Partial<PolicyFields> = {}): PolicyFields {
  return {
    max_per_tx_usdc: null,
    daily_cap_usdc: null,
    weekly_cap_usdc: null,
    monthly_cap_usdc: null,
    allowlist_addresses: [],
    blocklist_addresses: [],
    allowlist_usernames: [],
    blocklist_usernames: [],
    allowed_hours_utc: null,
    cosign_threshold_usdc: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    now: new Date('2025-06-15T12:00:00Z'), // noon UTC, Sunday
    todaySpendMicroUsdc: 0n,
    weekSpendMicroUsdc: 0n,
    monthSpendMicroUsdc: 0n,
    resolvedUsername: null,
    ...overrides,
  };
}

const ADDR_A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ADDR_B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const ADDR_C = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC';

describe('policy-engine evaluate()', () => {
  describe('empty policy (no restrictions)', () => {
    it('allows any transfer', () => {
      const result = evaluate(makePolicy(), { recipientAddress: ADDR_A, amountMicroUsdc: 1000n * MICRO }, makeCtx());
      expect(result).toEqual({ outcome: 'execute' });
    });

    it('allows zero-amount transfer', () => {
      const result = evaluate(makePolicy(), { recipientAddress: ADDR_A, amountMicroUsdc: 0n }, makeCtx());
      expect(result).toEqual({ outcome: 'execute' });
    });
  });

  describe('blocklist address', () => {
    it('blocks a blocklisted address', () => {
      const policy = makePolicy({ blocklist_addresses: [ADDR_A] });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, makeCtx());
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_address_blocklisted' });
    });

    it('blocklist is case-insensitive', () => {
      const policy = makePolicy({ blocklist_addresses: [ADDR_A.toLowerCase()] });
      const result = evaluate(policy, { recipientAddress: ADDR_A.toUpperCase(), amountMicroUsdc: 10n * MICRO }, makeCtx());
      expect(result.outcome).toBe('blocked');
    });

    it('allows non-blocklisted address', () => {
      const policy = makePolicy({ blocklist_addresses: [ADDR_A] });
      const result = evaluate(policy, { recipientAddress: ADDR_B, amountMicroUsdc: 10n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });
  });

  describe('blocklist username', () => {
    it('blocks a blocklisted username', () => {
      const policy = makePolicy({ blocklist_usernames: ['alice'] });
      const ctx = makeCtx({ resolvedUsername: 'alice' });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_username_blocklisted' });
    });

    it('blocklist username is case-insensitive', () => {
      const policy = makePolicy({ blocklist_usernames: ['Alice'] });
      const ctx = makeCtx({ resolvedUsername: 'alice' });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result.outcome).toBe('blocked');
    });

    it('does not block if username is null (unresolvable)', () => {
      const policy = makePolicy({ blocklist_usernames: ['alice'] });
      const ctx = makeCtx({ resolvedUsername: null });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result.outcome).toBe('execute');
    });
  });

  describe('allowed hours UTC', () => {
    it('allows transfer within hours range [9,18)', () => {
      const policy = makePolicy({ allowed_hours_utc: '[9,18)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T12:00:00Z') }); // 12:00 UTC
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result.outcome).toBe('execute');
    });

    it('blocks transfer outside hours range [9,18)', () => {
      const policy = makePolicy({ allowed_hours_utc: '[9,18)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T06:00:00Z') }); // 06:00 UTC
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'outside_allowed_hours' });
    });

    it('boundary: hour 9 is included in [9,18)', () => {
      const policy = makePolicy({ allowed_hours_utc: '[9,18)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T09:00:00Z') });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('execute');
    });

    it('boundary: hour 18 is excluded from [9,18)', () => {
      const policy = makePolicy({ allowed_hours_utc: '[9,18)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T18:00:00Z') });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('blocked');
    });

    it('wrapping range [22,6) allows hour 23', () => {
      const policy = makePolicy({ allowed_hours_utc: '[22,6)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T23:00:00Z') });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('execute');
    });

    it('wrapping range [22,6) allows hour 3', () => {
      const policy = makePolicy({ allowed_hours_utc: '[22,6)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T03:00:00Z') });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('execute');
    });

    it('wrapping range [22,6) blocks hour 12', () => {
      const policy = makePolicy({ allowed_hours_utc: '[22,6)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T12:00:00Z') });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('blocked');
    });

    it('wrapping range [22,6) blocks hour 6 (exclusive)', () => {
      const policy = makePolicy({ allowed_hours_utc: '[22,6)' });
      const ctx = makeCtx({ now: new Date('2025-06-15T06:00:00Z') });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('blocked');
    });
  });

  describe('allowlist address', () => {
    it('allows address in allowlist', () => {
      const policy = makePolicy({ allowlist_addresses: [ADDR_A, ADDR_B] });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });

    it('blocks address not in allowlist', () => {
      const policy = makePolicy({ allowlist_addresses: [ADDR_A] });
      const result = evaluate(policy, { recipientAddress: ADDR_B, amountMicroUsdc: 10n * MICRO }, makeCtx());
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_address_not_in_allowlist' });
    });

    it('allowlist is case-insensitive', () => {
      const policy = makePolicy({ allowlist_addresses: [ADDR_A.toLowerCase()] });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });
  });

  describe('allowlist username', () => {
    it('allows resolved username in allowlist', () => {
      const policy = makePolicy({ allowlist_usernames: ['alice', 'bob'] });
      const ctx = makeCtx({ resolvedUsername: 'alice' });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result.outcome).toBe('execute');
    });

    it('blocks resolved username not in allowlist', () => {
      const policy = makePolicy({ allowlist_usernames: ['alice'] });
      const ctx = makeCtx({ resolvedUsername: 'carol' });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_username_not_in_allowlist' });
    });

    it('blocks when username is null and allowlist is set', () => {
      const policy = makePolicy({ allowlist_usernames: ['alice'] });
      const ctx = makeCtx({ resolvedUsername: null });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 10n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_username_not_in_allowlist' });
    });
  });

  describe('per-tx cap', () => {
    it('allows amount equal to per-tx cap', () => {
      const policy = makePolicy({ max_per_tx_usdc: 50 });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 50n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });

    it('blocks amount exceeding per-tx cap', () => {
      const policy = makePolicy({ max_per_tx_usdc: 50 });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 50n * MICRO + 1n }, makeCtx());
      expect(result).toEqual({ outcome: 'blocked', reason: 'per_tx_cap_exceeded' });
    });

    it('allows amount below per-tx cap', () => {
      const policy = makePolicy({ max_per_tx_usdc: 50 });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 49n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });
  });

  describe('daily cap', () => {
    it('allows when cumulative + payment equals daily cap', () => {
      const policy = makePolicy({ daily_cap_usdc: 500 });
      const ctx = makeCtx({ todaySpendMicroUsdc: 400n * MICRO });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 100n * MICRO }, ctx);
      expect(result.outcome).toBe('execute');
    });

    it('blocks when cumulative + payment exceeds daily cap', () => {
      const policy = makePolicy({ daily_cap_usdc: 500 });
      const ctx = makeCtx({ todaySpendMicroUsdc: 400n * MICRO });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 100n * MICRO + 1n }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'daily_cap_exceeded' });
    });
  });

  describe('weekly cap', () => {
    it('blocks when cumulative + payment exceeds weekly cap', () => {
      const policy = makePolicy({ weekly_cap_usdc: 2000 });
      const ctx = makeCtx({ weekSpendMicroUsdc: 1900n * MICRO });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 101n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'weekly_cap_exceeded' });
    });

    it('allows when cumulative + payment equals weekly cap', () => {
      const policy = makePolicy({ weekly_cap_usdc: 2000 });
      const ctx = makeCtx({ weekSpendMicroUsdc: 1900n * MICRO });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 100n * MICRO }, ctx);
      expect(result.outcome).toBe('execute');
    });
  });

  describe('monthly cap', () => {
    it('blocks when cumulative + payment exceeds monthly cap', () => {
      const policy = makePolicy({ monthly_cap_usdc: 5000 });
      const ctx = makeCtx({ monthSpendMicroUsdc: 4999n * MICRO });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 2n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'monthly_cap_exceeded' });
    });
  });

  describe('cosign threshold', () => {
    it('requires cosign when amount exceeds threshold', () => {
      const policy = makePolicy({ cosign_threshold_usdc: 200 });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 200n * MICRO + 1n }, makeCtx());
      expect(result).toEqual({ outcome: 'cosign_required', reason: 'exceeds_cosign_threshold' });
    });

    it('allows when amount equals cosign threshold', () => {
      const policy = makePolicy({ cosign_threshold_usdc: 200 });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 200n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });

    it('allows when amount is below cosign threshold', () => {
      const policy = makePolicy({ cosign_threshold_usdc: 200 });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 199n * MICRO }, makeCtx());
      expect(result.outcome).toBe('execute');
    });
  });

  describe('check ordering (short-circuit)', () => {
    it('blocklist address fires before per-tx cap', () => {
      const policy = makePolicy({
        blocklist_addresses: [ADDR_A],
        max_per_tx_usdc: 1000,
      });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, makeCtx());
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_address_blocklisted' });
    });

    it('blocklist username fires before allowed hours', () => {
      const policy = makePolicy({
        blocklist_usernames: ['alice'],
        allowed_hours_utc: '[0,24)',
      });
      const ctx = makeCtx({ resolvedUsername: 'alice' });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_username_blocklisted' });
    });

    it('allowed hours fires before allowlist check', () => {
      const policy = makePolicy({
        allowed_hours_utc: '[9,10)',
        allowlist_addresses: [ADDR_A],
      });
      const ctx = makeCtx({ now: new Date('2025-06-15T12:00:00Z') });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'outside_allowed_hours' });
    });

    it('per-tx cap fires before cosign threshold', () => {
      const policy = makePolicy({
        max_per_tx_usdc: 10,
        cosign_threshold_usdc: 5,
      });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 11n * MICRO }, makeCtx());
      expect(result).toEqual({ outcome: 'blocked', reason: 'per_tx_cap_exceeded' });
    });

    it('daily cap fires before cosign threshold', () => {
      const policy = makePolicy({
        daily_cap_usdc: 100,
        cosign_threshold_usdc: 50,
      });
      const ctx = makeCtx({ todaySpendMicroUsdc: 99n * MICRO });
      const result = evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 60n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'daily_cap_exceeded' });
    });
  });

  describe('mixed username + address allowlists', () => {
    it('both allowlists set: must satisfy both', () => {
      const policy = makePolicy({
        allowlist_addresses: [ADDR_A],
        allowlist_usernames: ['alice'],
      });
      // Address matches, username matches
      const ctx = makeCtx({ resolvedUsername: 'alice' });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx).outcome).toBe('execute');
    });

    it('address matches but username does not', () => {
      const policy = makePolicy({
        allowlist_addresses: [ADDR_A],
        allowlist_usernames: ['alice'],
      });
      const ctx = makeCtx({ resolvedUsername: 'bob' });
      expect(evaluate(policy, { recipientAddress: ADDR_A, amountMicroUsdc: 1n }, ctx)).toEqual({
        outcome: 'blocked',
        reason: 'recipient_username_not_in_allowlist',
      });
    });

    it('username matches but address does not', () => {
      const policy = makePolicy({
        allowlist_addresses: [ADDR_A],
        allowlist_usernames: ['alice'],
      });
      const ctx = makeCtx({ resolvedUsername: 'alice' });
      expect(evaluate(policy, { recipientAddress: ADDR_B, amountMicroUsdc: 1n }, ctx)).toEqual({
        outcome: 'blocked',
        reason: 'recipient_address_not_in_allowlist',
      });
    });
  });

  describe('full policy with all fields set', () => {
    const fullPolicy = makePolicy({
      max_per_tx_usdc: 50,
      daily_cap_usdc: 500,
      weekly_cap_usdc: 2000,
      monthly_cap_usdc: 5000,
      allowlist_addresses: [ADDR_A, ADDR_B],
      blocklist_addresses: [ADDR_C],
      allowlist_usernames: ['alice', 'bob'],
      blocklist_usernames: ['eve'],
      allowed_hours_utc: '[9,18)',
      cosign_threshold_usdc: 25,
    });

    it('allows a valid transfer within all constraints', () => {
      const ctx = makeCtx({ resolvedUsername: 'alice', now: new Date('2025-06-15T10:00:00Z') });
      const result = evaluate(fullPolicy, { recipientAddress: ADDR_A, amountMicroUsdc: 20n * MICRO }, ctx);
      expect(result.outcome).toBe('execute');
    });

    it('requires cosign for amount over threshold but within caps', () => {
      const ctx = makeCtx({ resolvedUsername: 'alice', now: new Date('2025-06-15T10:00:00Z') });
      const result = evaluate(fullPolicy, { recipientAddress: ADDR_A, amountMicroUsdc: 30n * MICRO }, ctx);
      expect(result).toEqual({ outcome: 'cosign_required', reason: 'exceeds_cosign_threshold' });
    });

    it('blocks blocklisted address even with valid username', () => {
      const ctx = makeCtx({ resolvedUsername: 'alice', now: new Date('2025-06-15T10:00:00Z') });
      const result = evaluate(fullPolicy, { recipientAddress: ADDR_C, amountMicroUsdc: 1n }, ctx);
      expect(result).toEqual({ outcome: 'blocked', reason: 'recipient_address_blocklisted' });
    });
  });
});
