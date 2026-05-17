import { supabase } from '../lib/supabase.js';
import type { CircleCliRunner } from './circle-cli.js';
import type { Logger } from 'pino';
import { evaluate, type PolicyFields, type EvaluationContext } from './policy-engine-import.js';

interface BatchPaymentRow {
  id: string;
  recipient_wallet: string;
  amount: number;
  status: string;
}

interface BatchRequestRow {
  id: string;
  executor_agent_wallet_id: string;
  executor_state: string;
  recipients: Array<{ wallet: string; amount: number; label?: string }>;
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

  // 1. Mark as in_progress
  await supabase
    .from('batch_requests')
    .update({ executor_state: 'in_progress' })
    .eq('id', batch.id);

  // 2. Load the agent wallet and its escrow address
  const { data: wallet } = await supabase
    .from('agent_wallets')
    .select('*')
    .eq('id', batch.executor_agent_wallet_id)
    .single();

  if (!wallet || !wallet.escrow_address) {
    batchLog.error('No escrow address for agent wallet');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed' })
      .eq('id', batch.id);
    return;
  }

  // 3. Load policy
  const { data: policyRow } = await supabase
    .from('agent_policies')
    .select('*')
    .eq('agent_wallet_id', wallet.id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // If no policy, everything is allowed (empty policy)
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

  // 4. Compute spend windows from audit log
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

  // 5. Load batch_payments
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

  // 6. Process each payment
  for (const payment of payments as BatchPaymentRow[]) {
    // Skip already processed (idempotency)
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

    // Resolve username (if the wallet matches a profile)
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

        // Write audit log
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

        // Write receipt
        await supabase.from('receipts').insert({
          sender: wallet.escrow_address,
          receiver: payment.recipient_wallet,
          amount: payment.amount,
          tx_hash: result.txHash,
          status: 'paid',
          initiator_type: 'agent',
        });

        // Mark payment completed
        await supabase
          .from('batch_payments')
          .update({ status: 'paid' })
          .eq('id', payment.id);

        // Update running spend
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
    }
  }

  // 7. Set final executor_state
  await supabase
    .from('batch_requests')
    .update({ executor_state: 'completed' })
    .eq('id', batch.id);

  batchLog.info('Batch processing complete');
}
