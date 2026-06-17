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

  it('extracts a recipient when the amount appears before the wallet', () => {
    const wallet = '0x1111111111111111111111111111111111111111';
    const plan = planPaymentIntentLocally(
      `Prepare a payment of 0.01 MNT to ${wallet} on Mantle Sepolia. Require my approval before execution.`,
      { currentChainKey: 'arc-testnet' },
    );

    expect(plan.chainKey).toBe('mantle-sepolia');
    expect(plan.recipients).toEqual([{ wallet, amount: 0.01, label: '' }]);
    expect(plan.warnings).not.toContain('No recipients were found. Add recipients manually or import a CSV before applying the plan.');
  });

  it('uses Mantle mainnet only when mainnet is explicit', () => {
    const wallet = '0x1111111111111111111111111111111111111111';
    const plan = planPaymentIntentLocally(`Pay 0.01 MNT to ${wallet} on Mantle mainnet. Require my approval.`, {
      currentChainKey: 'mantle-sepolia',
    });

    expect(plan.chainKey).toBe('mantle-mainnet');
    expect(plan.recipients).toEqual([{ wallet, amount: 0.01, label: '' }]);
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
    expect(plan.constraints.requireHumanApproval).toBe(false);
    expect(plan.warnings[0]).toContain('eligible agent wallet and policy');
  });

  it('treats no-approval language as a policy-gated agent request', () => {
    const wallet = '0x1111111111111111111111111111111111111111';
    const plan = planPaymentIntentLocally(`Pay 0.01 MNT to ${wallet} without approval on Mantle`, {
      currentChainKey: 'arc-testnet',
    });

    expect(plan.executionMode).toBe('agent');
    expect(plan.constraints.requireHumanApproval).toBe(false);
    expect(plan.warnings[0]).toContain('without a wallet signature');
  });
});
