import { describe, expect, it } from 'vitest';
import { planPaymentIntentLocally } from './intent-planner';

describe('planPaymentIntentLocally', () => {
  it('extracts a recipient, amount, and Mantle rail', () => {
    const plan = planPaymentIntentLocally('Pay @alice 5 MNT on Mantle', {
      currentChainKey: 'arc-testnet',
    });

    expect(plan.chainKey).toBe('mantle-sepolia');
    expect(plan.recipients).toEqual([{ wallet: '@alice', amount: 5, label: '' }]);
    expect(plan.constraints.requireHumanApproval).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('unverified'))).toBe(true);
  });

  it('preserves imported recipients when the intent refers to the existing draft', () => {
    const plan = planPaymentIntentLocally('Pay these 10 contributors on Mantle and block duplicates', {
      currentChainKey: 'arc-testnet',
      currentRecipients: [{ wallet: '@alice', amount: 2, label: 'Alice' }],
    });

    expect(plan.recipients).toHaveLength(1);
    expect(plan.recipients[0].wallet).toBe('@alice');
    expect(plan.constraints.duplicateCheck).toBe(true);
  });

  it('keeps approval required when autonomous execution is requested', () => {
    const plan = planPaymentIntentLocally('Automatically pay @alice 3 on Mantle', {
      currentChainKey: 'arc-testnet',
    });

    expect(plan.executionMode).toBe('agent');
    expect(plan.constraints.requireHumanApproval).toBe(true);
    expect(plan.warnings[0]).toContain('human approval');
  });
});
