import { supabase } from '../lib/supabase.js';
import type { Logger } from 'pino';

interface RecurringPaymentRow {
  id: string;
  creator_wallet: string;
  receiver_wallet: string;
  amount: number;
  chain_id: number;
  token_symbol: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  interval_count: number;
  next_run_at: string;
  end_at: string | null;
  max_runs: number | null;
  run_count: number;
  status: 'active' | 'paused' | 'cancelled' | 'complete';
  title: string | null;
  memo: string | null;
  execution_mode: 'human' | 'agent';
  executor_agent_wallet_id: string | null;
}

const DUE_LIMIT = 20;

/**
 * Turn due agent recurring plans into normal batch requests.
 * The existing batch processor then applies policy, Byreal preflight, and rail execution.
 */
export async function queueDueRecurringPayments(log: Logger): Promise<void> {
  const now = new Date();

  const { data: plans, error } = await supabase
    .from('recurring_payments')
    .select('*')
    .eq('status', 'active')
    .eq('execution_mode', 'agent')
    .not('executor_agent_wallet_id', 'is', null)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(DUE_LIMIT);

  if (error) {
    log.error({ error }, 'Failed to query due recurring payments');
    return;
  }

  if (!plans || plans.length === 0) return;

  for (const plan of plans as RecurringPaymentRow[]) {
    await queueRecurringPayment(plan, now, log);
  }
}

async function queueRecurringPayment(
  plan: RecurringPaymentRow,
  now: Date,
  log: Logger,
): Promise<void> {
  const recurringLog = log.child({ recurring_payment_id: plan.id });

  if (!plan.executor_agent_wallet_id) return;

  if (plan.max_runs !== null && plan.run_count >= plan.max_runs) {
    await markRecurringComplete(plan.id);
    return;
  }

  if (plan.end_at && new Date(plan.end_at).getTime() < now.getTime()) {
    await markRecurringComplete(plan.id);
    return;
  }

  const recipient = {
    wallet: plan.receiver_wallet,
    amount: Number(plan.amount),
    label: plan.title ?? 'Recurring payment',
  };

  const { data: batch, error: batchError } = await supabase
    .from('batch_requests')
    .insert({
      creator_wallet: plan.creator_wallet,
      title: plan.title ?? 'Recurring payment',
      description: plan.memo ?? `Recurring ${plan.frequency} payment`,
      recipients: [recipient],
      total_amount: plan.amount,
      status: 'pending',
      chain_id: plan.chain_id,
      token_symbol: plan.token_symbol,
      executor_agent_wallet_id: plan.executor_agent_wallet_id,
      executor_state: 'pending_evaluation',
    })
    .select('id')
    .single();

  if (batchError || !batch?.id) {
    recurringLog.error({ error: batchError }, 'Failed to create recurring batch request');
    return;
  }

  const { error: paymentError } = await supabase.from('batch_payments').insert({
    batch_request_id: batch.id,
    payer_wallet: plan.creator_wallet,
    recipient_wallet: plan.receiver_wallet,
    amount: plan.amount,
    tx_hash: '',
    chain_id: plan.chain_id,
    token_symbol: plan.token_symbol,
    status: 'pending',
  });

  if (paymentError) {
    recurringLog.error({ batch_id: batch.id, error: paymentError }, 'Failed to create recurring batch payment');
    await supabase
      .from('batch_requests')
      .update({ executor_state: 'failed', status: 'pending' })
      .eq('id', batch.id);
    return;
  }

  const nextRunCount = plan.run_count + 1;
  const nextRunAt = addInterval(new Date(plan.next_run_at), plan.frequency, plan.interval_count);
  const completed =
    (plan.max_runs !== null && nextRunCount >= plan.max_runs) ||
    (plan.end_at !== null && nextRunAt.getTime() > new Date(plan.end_at).getTime());

  const { error: updateError } = await supabase
    .from('recurring_payments')
    .update({
      run_count: nextRunCount,
      last_run_at: now.toISOString(),
      next_run_at: nextRunAt.toISOString(),
      status: completed ? 'complete' : 'active',
      updated_at: now.toISOString(),
    })
    .eq('id', plan.id);

  if (updateError) {
    recurringLog.error({ error: updateError }, 'Failed to advance recurring payment schedule');
    return;
  }

  recurringLog.info(
    { batch_id: batch.id, next_run_at: nextRunAt.toISOString(), status: completed ? 'complete' : 'active' },
    'Queued recurring payment batch',
  );
}

async function markRecurringComplete(id: string) {
  await supabase
    .from('recurring_payments')
    .update({ status: 'complete', updated_at: new Date().toISOString() })
    .eq('id', id);
}

function addInterval(date: Date, frequency: RecurringPaymentRow['frequency'], intervalCount: number): Date {
  const next = new Date(date);
  if (frequency === 'daily') {
    next.setUTCDate(next.getUTCDate() + intervalCount);
    return next;
  }
  if (frequency === 'weekly') {
    next.setUTCDate(next.getUTCDate() + intervalCount * 7);
    return next;
  }
  next.setUTCMonth(next.getUTCMonth() + intervalCount);
  return next;
}
