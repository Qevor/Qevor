import { describe, expect, it } from 'vitest';
import { reviewPaymentDraft } from './safety-review';

const addressA = '0x1111111111111111111111111111111111111111';
const addressB = '0x2222222222222222222222222222222222222222';

describe('reviewPaymentDraft', () => {
  it('allows a valid payment draft and totals it', () => {
    const result = reviewPaymentDraft(`${addressA},1.5,Alice\n${addressB},2,Bob`);

    expect(result.allowed).toBe(true);
    expect(result.total).toBe(3.5);
    expect(result.recipients).toHaveLength(2);
  });

  it('blocks duplicate recipients regardless of address casing', () => {
    const result = reviewPaymentDraft(`${addressA},1,Alice\n${addressA.toUpperCase()},2,Alice again`);

    expect(result.allowed).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('Duplicate recipient'))).toBe(true);
  });

  it('blocks invalid addresses and invalid amounts', () => {
    const result = reviewPaymentDraft('not an address,0,Broken');

    expect(result.allowed).toBe(false);
    expect(result.issues.filter((issue) => issue.severity === 'block')).toHaveLength(2);
  });

  it('allows Qevor usernames', () => {
    const result = reviewPaymentDraft('@alice,1.25,Alice');

    expect(result.allowed).toBe(true);
  });
});
