import { supabase } from '../lib/supabase.js';
import type { RailRunner } from './rail-runner.js';
import type { Logger } from 'pino';
import { evaluate, type PolicyFields, type EvaluationContext } from './policy-engine-import.js';
import {
  chainIdForAgentChain,
  escrowContractAddressForAgentChain,
  isMantleAgentChain,
  normalizeAgentChain,
  tokenSymbolForAgentChain,
} from './chain-support.js';

interface BatchPaymentRow {
  id: string;
  recipient_wallet: string;
  amount: number;
  status: string;
  chain_id?: number | null;
  token_symbol?: string | null;
}

interface BatchRequestRow {
  id: string;
  executor_agent_wallet_id: string;
  executor_state: string;
  chain_id?: number | null;
  token_symbol?: string | null;
  recipients: Array<{ wallet: string; amount: number; label?: string }>;
}

/**
 * Process all batch_requests with executor_state = 'pending_evaluation'.
 */
export async function processPendingBatches(
  getRunnerForChain: (chain: string) => RailRunner | null,
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
    await processBatch(batch, getRunnerForChain, log);
  }
}

async function processBatch(
  batch: BatchRequestRow,
  getRunnerForChain: (chain: string) => RailRunner | null,
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

  if (!wallet) {
    batchLog.error('No agent wallet found for batch');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed' })
      .eq('id', batch.id);
    return;
  }

  const chain = normalizeAgentChain(wallet.chain);
  const configuredMantleEscrow = isMantleAgentChain(chain)
    ? escrowContractAddressForAgentChain(chain)
    : undefined;
  const executionFromAddress = configuredMantleEscrow || wallet.escrow_address;

  if (!executionFromAddress) {
    batchLog.error('No escrow address for agent wallet');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed' })
      .eq('id', batch.id);
    return;
  }

  const expectedChainId = chainIdForAgentChain(chain);
  if (batch.chain_id != null && batch.chain_id !== expectedChainId) {
    batchLog.error({ batch_chain_id: batch.chain_id, wallet_chain: chain }, 'Batch chain does not match agent wallet chain');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed' })
      .eq('id', batch.id);
    return;
  }

  const runner = getRunnerForChain(chain);
  if (!runner) {
    batchLog.error({ chain }, 'No executor rail available for agent wallet chain');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed' })
      .eq('id', batch.id);
    return;
  }

  const recordRailDecision = async (
    payment: BatchPaymentRow,
    outcome: 'blocked' | 'cosign_required' | 'failed',
    reason: string,
  ): Promise<Record<string, unknown>> => {
    if (!runner.recordDecision) return {};

    try {
      const result = await runner.recordDecision({
        decisionId: `${batch.id}:${payment.id}:${outcome}`,
        paymentId: payment.id,
        recipientAddress: payment.recipient_wallet,
        amount: payment.amount.toString(),
        outcome,
        reason,
        chain,
      });
      return {
        decision_tx_hash: result.txHash,
        ...(result.metadata ?? {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      batchLog.error({ payment_id: payment.id, outcome, err: message }, 'Failed to record agent decision on rail');
      return { decision_record_error: message };
    }
  };

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

  const recipientCounts = new Map<string, number>();
  for (const payment of payments as BatchPaymentRow[]) {
    const key = payment.recipient_wallet.toLowerCase();
    recipientCounts.set(key, (recipientCounts.get(key) ?? 0) + 1);
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

    if ((recipientCounts.get(payment.recipient_wallet.toLowerCase()) ?? 0) > 1) {
      const reason = 'duplicate_recipient_in_batch';
      const decisionMetadata = await recordRailDecision(payment, 'blocked', reason);
      await supabase.from('agent_audit_log').insert({
        agent_wallet_id: wallet.id,
        policy_id: policyRow?.id ?? null,
        batch_request_id: batch.id,
        batch_payment_id: payment.id,
        action: 'batch_execute',
        recipient_address: payment.recipient_wallet,
        amount_usdc: payment.amount,
        outcome: 'blocked',
        reason,
        metadata: decisionMetadata,
      });

      await supabase
        .from('batch_payments')
        .update({ status: 'blocked' })
        .eq('id', payment.id);

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
        const result = await runner.walletTransfer({
          toAddress: payment.recipient_wallet,
          amount: payment.amount.toString(),
          fromAddress: executionFromAddress,
          chain,
          metadata: {
            batchId: batch.id,
            paymentId: payment.id,
            profileWallet: wallet.profile_wallet,
            storedEscrowAddress: wallet.escrow_address,
            configuredEscrowAddress: configuredMantleEscrow ?? null,
          },
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
          circle_tx_id: result.circleTxId ?? null,
          metadata: result.metadata ?? {},
        });

        // Write receipt
        await supabase.from('receipts').insert({
          sender: wallet.profile_wallet,
          receiver: payment.recipient_wallet,
          amount: payment.amount,
          tx_hash: result.txHash,
          status: 'paid',
          initiator_type: 'agent',
          chain_id: payment.chain_id ?? batch.chain_id ?? expectedChainId,
          token_symbol: payment.token_symbol ?? batch.token_symbol ?? tokenSymbolForAgentChain(chain),
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
        const decisionMetadata = await recordRailDecision(payment, 'failed', errMsg);

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
          metadata: decisionMetadata,
        });

        await supabase
          .from('batch_payments')
          .update({ status: 'failed' })
          .eq('id', payment.id);
      }

    } else if (decision.outcome === 'cosign_required') {
      const decisionMetadata = await recordRailDecision(payment, 'cosign_required', decision.reason);
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
        metadata: decisionMetadata,
      });

      await supabase
        .from('batch_payments')
        .update({ status: 'awaiting_cosign' })
        .eq('id', payment.id);

    } else {
      // blocked
      const decisionMetadata = await recordRailDecision(payment, 'blocked', decision.reason);
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
        metadata: decisionMetadata,
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
