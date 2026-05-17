import { describe, it, expect } from 'vitest';
import { describePolicy } from './describe-policy';
import type { AgentPolicy } from './types';

function makePolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    id: 'test',
    agent_wallet_id: 'test',
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
    mirrored_to_circle_at: null,
    active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('describePolicy', () => {
  it('returns no-restrictions message for empty policy', () => {
    expect(describePolicy(makePolicy())).toBe('No restrictions. This agent can send without limits.');
  });

  it('describes per-tx cap', () => {
    const result = describePolicy(makePolicy({ max_per_tx_usdc: 50 }));
    expect(result).toContain('$50');
    expect(result).toContain('per transfer');
  });

  it('describes daily cap', () => {
    const result = describePolicy(makePolicy({ daily_cap_usdc: 500 }));
    expect(result).toContain('$500');
    expect(result).toContain('per day');
  });

  it('describes allowlist usernames', () => {
    const result = describePolicy(makePolicy({ allowlist_usernames: ['alice', 'bob'] }));
    expect(result).toContain('@alice');
    expect(result).toContain('@bob');
  });

  it('describes allowed hours', () => {
    const result = describePolicy(makePolicy({ allowed_hours_utc: '[9,18)' }));
    expect(result).toContain('09:00');
    expect(result).toContain('18:00');
    expect(result).toContain('UTC');
  });

  it('describes cosign threshold', () => {
    const result = describePolicy(makePolicy({ cosign_threshold_usdc: 200 }));
    expect(result).toContain('$200');
    expect(result).toContain('approval');
  });
});
