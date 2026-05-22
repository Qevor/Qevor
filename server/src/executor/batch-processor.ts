import { supabase } from '../lib/supabase.js';
import type { CircleCliRunner } from './circle-cli.js';
import type { Logger } from 'pino';
import { evaluate, type PolicyFields, type EvaluationContext } from './policy-engine-import.js';
import {
  NotaryAttestationVerifier,
  shouldVerify,
  type AttestationRow,
  type VerificationResult,
} from '../lib/notary-attestation.js';
import {
  sendSettlementWebhook,
  type NotaryWebhookConfig,
  type SettlementEvent,
  type SettlementState,
} from '../lib/notary-webhook.js';

interface BatchPaymentRow {
  id: string;
  recipient_wallet: string;
  amount: number;
  status: string;
}

// Extended to carry NOTARY attestation material. All attestation_* fields are
// nullable because pre-NOTARY rows do not populate them and the existing direct-
// from-app batch flow continues to work.
interface BatchRequestRow extends AttestationRow {
  executor_agent_wallet_id: string;
  executor_state: string;
  recipients: Array<{ wallet: string; amount: number; label?: string }>;
}

interface AgentWalletRow {
  id: string;
  escrow_address: string | null;
  chain: string;
  attestation_mode: 'off' | 'optional' | 'required';
}

/**
 * Build verifier + webhook config from env. Centralized so the executor wires
 * both at construction and tests can substitute.
 */
export function buildNotaryRuntime(): {
  verifier: NotaryAttestationVerifier;
  webhook: NotaryWebhookConfig;
} {
  const verifier = new NotaryAttestationVerifier({
    defaultRpcUrl: process.env.NOTARY_ARC_RPC_URL ?? undefined,
    defaultChainId: process.env.NOTARY_ARC_CHAIN_ID
      ? parseInt(process.env.NOTARY_ARC_CHAIN_ID, 10)
      : undefined,
    defaultAttestationRegistry: process.env.NOTARY_ATTESTATION_REGISTRY ?? undefined,
    defaultNotaryIdentityRegistry: process.env.NOTARY_IDENTITY_REGISTRY ?? undefined,
    defaultDomainName: process.env.NOTARY_EIP712_DOMAIN_NAME ?? 'NOTARY',
    defaultDomainVersion: process.env.NOTARY_EIP712_DOMAIN_VERSION ?? '1',
    rpcTimeoutMs: process.env.NOTARY_RPC_TIMEOUT_MS
      ? parseInt(process.env.NOTARY_RPC_TIMEOUT_MS, 10)
      : undefined,
    rpcRetries: process.env.NOTARY_RPC_RETRIES
      ? parseInt(process.env.NOTARY_RPC_RETRIES, 10)
      : undefined,
  });
  const webhook: NotaryWebhookConfig = {
    url: process.env.NOTARY_WEBHOOK_URL ?? null,
    secret: process.env.NOTARY_WEBHOOK_SECRET ?? null,
    signatureHeader: process.env.NOTARY_WEBHOOK_SIGNATURE_HEADER ?? 'x-signature',
    timeoutMs: process.env.NOTARY_WEBHOOK_TIMEOUT_MS
      ? parseInt(process.env.NOTARY_WEBHOOK_TIMEOUT_MS, 10)
      : undefined,
  };
  return { verifier, webhook };
}

// Module-level instance, reused across polls. Tests reset via __setNotaryRuntimeForTests.
let runtime: ReturnType<typeof buildNotaryRuntime> | null = null;
function getRuntime() {
  if (!runtime) runtime = buildNotaryRuntime();
  return runtime;
}
export function __setNotaryRuntimeForTests(r: ReturnType<typeof buildNotaryRuntime> | null) {
  runtime = r;
}

/**
 * Process all batch_requests with executor_state = 'pending_evaluation'.
 */
export async function processPendingBatches(
  cli: CircleCliRunner,
  log: Logger,
): Promise<void> {
  const { data: batches, error } = await supabase
    .from('batch_requests')
    .select('*')
    .eq('executor_state', 'pending_evaluation')
    .not('executor_agent_wallet_id', 'is', null);

  if (error) {
    log.error({ error }, 'Failed to query pending batches');
    return;
  }

  if (!batches || batches.length === 0) return;

  for (const batch of batches as BatchRequestRow[]) {
    await processBatch(batch, cli, log);
  }
}

async function processBatch(
  batch: BatchRequestRow,
  cli: CircleCliRunner,
  log: Logger,
): Promise<void> {
  const batchLog = log.child({ batch_id: batch.id });
  batchLog.info('Processing batch');

  // 1. Mark as in_progress.
  await supabase
    .from('batch_requests')
    .update({ executor_state: 'in_progress' })
    .eq('id', batch.id);

  // 2. Load the agent wallet (and its attestation_mode).
  const { data: walletData } = await supabase
    .from('agent_wallets')
    .select('id, escrow_address, chain, attestation_mode')
    .eq('id', batch.executor_agent_wallet_id)
    .single();

  const wallet = walletData as AgentWalletRow | null;

  if (!wallet || !wallet.escrow_address) {
    batchLog.error('No escrow address for agent wallet');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed' })
      .eq('id', batch.id);
    return;
  }

  // 2a. NOTARY attestation gating. Runs before any payment-altering work, so a
  //     rejected verdict cannot leak through partial failures downstream.
  const { run, required } = shouldVerify(
    wallet.attestation_mode ?? 'off',
    Boolean(batch.attestation_id),
  );
  let verification: VerificationResult | null = null;
  if (run) {
    if (!batch.attestation_id && required) {
      verification = {
        outcome: 'rejected',
        reason: 'attestation_required_but_missing',
      };
    } else {
      const { verifier } = getRuntime();
      verification = await verifier.verify(batch, batchLog);
    }
    await recordVerification(batch, verification);

    if (verification.outcome === 'rejected') {
      batchLog.warn(
        { attestation_id: batch.attestation_id, reason: verification.reason },
        'batch rejected by attestation verifier',
      );
      await blockBatchOnAttestation(batch.id, verification.reason ?? 'rejected');
      return;
    }
    if (verification.outcome === 'rpc_unavailable') {
      // Do NOT pay, do NOT mark failed. Roll back to pending so the next tick
      // retries. Verification audit row above preserves the attempt.
      batchLog.warn(
        { reason: verification.reason },
        'attestation RPC unavailable; will retry on next poll',
      );
      await supabase
        .from('batch_requests')
        .update({ executor_state: 'pending_evaluation' })
        .eq('id', batch.id);
      return;
    }
    // verified — fall through to policy evaluation.
  }

  // 3. Load policy.
  const { data: policyRow } = await supabase
    .from('agent_policies')
    .select('*')
    .eq('agent_wallet_id', wallet.id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const policy: PolicyFields = policyRow ?? {
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
  };

  // 4. Compute spend windows from audit log.
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const spendQuery = async (since: Date): Promise<bigint> => {
    const { data } = await supabase
      .from('agent_audit_log')
      .select('amount_usdc')
      .eq('agent_wallet_id', wallet.id)
      .eq('outcome', 'executed')
      .gte('created_at', since.toISOString());

    if (!data) return 0n;
    return data.reduce((sum: bigint, row: { amount_usdc: number | null }) => {
      return sum + BigInt(Math.round((row.amount_usdc ?? 0) * 1_000_000));
    }, 0n);
  };

  let todaySpend = await spendQuery(dayAgo);
  let weekSpend = await spendQuery(weekAgo);
  let monthSpend = await spendQuery(monthAgo);

  // 5. Load batch_payments.
  const { data: payments } = await supabase
    .from('batch_payments')
    .select('*')
    .eq('batch_request_id', batch.id);

  if (!payments || payments.length === 0) {
    batchLog.warn('No batch_payments for this batch');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'completed' })
      .eq('id', batch.id);
    return;
  }

  // 6. Process each payment.
  for (const payment of payments as BatchPaymentRow[]) {
    // Skip already processed (idempotency).
    const { data: existing } = await supabase
      .from('agent_audit_log')
      .select('id, outcome')
      .eq('batch_payment_id', payment.id)
      .in('outcome', ['executed', 'blocked', 'cosign_required'])
      .limit(1);

    if (existing && existing.length > 0) {
      batchLog.debug({ payment_id: payment.id, outcome: existing[0].outcome }, 'Already processed, skipping');
      continue;
    }

    const amountMicro = BigInt(Math.round(payment.amount * 1_000_000));

    // Resolve username (if the wallet matches a profile).
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .ilike('wallet', payment.recipient_wallet)
      .limit(1)
      .single();

    const ctx: EvaluationContext = {
      now,
      todaySpendMicroUsdc: todaySpend,
      weekSpendMicroUsdc: weekSpend,
      monthSpendMicroUsdc: monthSpend,
      resolvedUsername: profile?.username ?? null,
    };

    const decision = evaluate(policy, {
      recipientAddress: payment.recipient_wallet,
      amountMicroUsdc: amountMicro,
    }, ctx);

    batchLog.info({
      payment_id: payment.id,
      recipient: payment.recipient_wallet,
      amount: payment.amount,
      outcome: decision.outcome,
    }, 'Payment evaluated');

    if (decision.outcome === 'execute') {
      try {
        const result = await cli.walletTransfer({
          toAddress: payment.recipient_wallet,
          amount: payment.amount.toString(),
          fromAddress: wallet.escrow_address,
          chain: wallet.chain,
        });

        await supabase.from('agent_audit_log').insert({
          agent_wallet_id: wallet.id,
          policy_id: policyRow?.id ?? null,
          batch_request_id: batch.id,
          batch_payment_id: payment.id,
          action: 'batch_execute',
          recipient_username: profile?.username ?? null,
          recipient_address: payment.recipient_wallet,
          amount_usdc: payment.amount,
          outcome: 'executed',
          tx_hash: result.txHash,
          circle_tx_id: result.circleTxId,
        });

        await supabase.from('receipts').insert({
          sender: wallet.escrow_address,
          receiver: payment.recipient_wallet,
          amount: payment.amount,
          tx_hash: result.txHash,
          status: 'paid',
          initiator_type: 'agent',
        });

        await supabase
          .from('batch_payments')
          .update({ status: 'paid' })
          .eq('id', payment.id);

        await notifyNotaryIfApplicable(batch, payment, 'paid', batchLog, {
          tx_hash: result.txHash,
        });

        todaySpend += amountMicro;
        weekSpend += amountMicro;
        monthSpend += amountMicro;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        batchLog.error({ payment_id: payment.id, err: errMsg }, 'Transfer failed');

        await supabase.from('agent_audit_log').insert({
          agent_wallet_id: wallet.id,
          policy_id: policyRow?.id ?? null,
          batch_request_id: batch.id,
          batch_payment_id: payment.id,
          action: 'batch_execute',
          recipient_address: payment.recipient_wallet,
          amount_usdc: payment.amount,
          outcome: 'failed',
          reason: errMsg,
        });

        await supabase
          .from('batch_payments')
          .update({ status: 'failed' })
          .eq('id', payment.id);

        await notifyNotaryIfApplicable(batch, payment, 'failed', batchLog, {
          reason: errMsg,
        });
      }
    } else if (decision.outcome === 'cosign_required') {
      await supabase.from('agent_cosign_queue').insert({
        agent_wallet_id: wallet.id,
        batch_payment_id: payment.id,
        recipient_username: profile?.username ?? null,
        recipient_address: payment.recipient_wallet,
        amount_usdc: payment.amount,
        reason: decision.reason,
      });

      await supabase.from('agent_audit_log').insert({
        agent_wallet_id: wallet.id,
        policy_id: policyRow?.id ?? null,
        batch_request_id: batch.id,
        batch_payment_id: payment.id,
        action: 'batch_execute',
        recipient_username: profile?.username ?? null,
        recipient_address: payment.recipient_wallet,
        amount_usdc: payment.amount,
        outcome: 'cosign_required',
        reason: decision.reason,
      });

      await supabase
        .from('batch_payments')
        .update({ status: 'awaiting_cosign' })
        .eq('id', payment.id);

      await notifyNotaryIfApplicable(batch, payment, 'cosign_required', batchLog, {
        reason: decision.reason,
      });
    } else {
      // blocked
      await supabase.from('agent_audit_log').insert({
        agent_wallet_id: wallet.id,
        policy_id: policyRow?.id ?? null,
        batch_request_id: batch.id,
        batch_payment_id: payment.id,
        action: 'batch_execute',
        recipient_username: profile?.username ?? null,
        recipient_address: payment.recipient_wallet,
        amount_usdc: payment.amount,
        outcome: 'blocked',
        reason: decision.reason,
      });

      await supabase
        .from('batch_payments')
        .update({ status: 'blocked' })
        .eq('id', payment.id);

      await notifyNotaryIfApplicable(batch, payment, 'blocked', batchLog, {
        reason: decision.reason,
      });
    }
  }

  // 7. Set final executor_state.
  await supabase
    .from('batch_requests')
    .update({ executor_state: 'completed' })
    .eq('id', batch.id);

  batchLog.info('Batch processing complete');
}

async function recordVerification(
  batch: BatchRequestRow,
  verification: VerificationResult,
): Promise<void> {
  const { data: prior } = await supabase
    .from('notary_verifications')
    .select('attempt')
    .eq('batch_request_id', batch.id)
    .order('attempt', { ascending: false })
    .limit(1);
  const nextAttempt = prior && prior[0]?.attempt ? prior[0].attempt + 1 : 1;

  await supabase.from('notary_verifications').insert({
    batch_request_id: batch.id,
    attestation_id: batch.attestation_id ?? 'none',
    notary_id: batch.notary_id,
    signer_recovered: verification.signerRecovered ?? null,
    signer_onchain: verification.signerOnchain ?? null,
    notary_agent_wallet: verification.notaryAgentWallet ?? null,
    notary_status: verification.notaryStatus ?? null,
    attestation_status: verification.attestationStatus ?? null,
    confidence_bps_onchain: verification.confidenceBpsOnchain ?? null,
    outcome: verification.outcome,
    reason: verification.reason ?? null,
    attempt: nextAttempt,
  });
}

async function blockBatchOnAttestation(
  batchId: string,
  reason: string,
): Promise<void> {
  // Mark the batch failed and every pending payment blocked with attestation reason.
  await supabase
    .from('batch_requests')
    .update({ executor_state: 'failed' })
    .eq('id', batchId);
  const { data: payments } = await supabase
    .from('batch_payments')
    .select('id')
    .eq('batch_request_id', batchId);
  if (!payments) return;
  for (const p of payments as { id: string }[]) {
    await supabase
      .from('batch_payments')
      .update({ status: 'blocked' })
      .eq('id', p.id);
    await supabase.from('agent_audit_log').insert({
      batch_request_id: batchId,
      batch_payment_id: p.id,
      action: 'attestation_check',
      outcome: 'blocked',
      reason: `attestation_${reason}`.slice(0, 200),
    });
  }
}

async function notifyNotaryIfApplicable(
  batch: BatchRequestRow,
  payment: BatchPaymentRow,
  state: SettlementState,
  log: Logger,
  extras: { tx_hash?: string; reason?: string } = {},
): Promise<void> {
  if (!batch.attestation_id) return;
  const { webhook } = getRuntime();
  if (!webhook.url || !webhook.secret) {
    // Mark pending so a future operator-triggered redelivery is easy to spot.
    await supabase
      .from('batch_payments')
      .update({
        notary_webhook_state: 'pending',
        notary_webhook_last_error: 'webhook_not_configured',
      })
      .eq('id', payment.id);
    return;
  }
  const event: SettlementEvent = {
    batch_request_id: batch.id,
    batch_payment_id: payment.id,
    attestation_id: batch.attestation_id,
    obligation_id: batch.obligation_id,
    state,
    amount_usdc: payment.amount,
    recipient_wallet: payment.recipient_wallet,
    tx_hash: extras.tx_hash,
    reason: extras.reason,
    emitted_at: new Date().toISOString(),
  };
  const { data: row } = await supabase
    .from('batch_payments')
    .select('notary_webhook_attempts')
    .eq('id', payment.id)
    .single();
  const attempts = (row?.notary_webhook_attempts ?? 0) + 1;

  const result = await sendSettlementWebhook(webhook, event, log);

  await supabase
    .from('batch_payments')
    .update({
      notary_webhook_state: result.delivered ? 'delivered' : 'failed',
      notary_webhook_attempts: attempts,
      notary_webhook_last_error: result.delivered ? null : result.error ?? null,
      notary_webhook_last_attempt_at: new Date().toISOString(),
    })
    .eq('id', payment.id);
}
