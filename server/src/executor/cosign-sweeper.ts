import { supabase } from '../lib/supabase.js';
import type { Logger } from 'pino';
import type { RailRunner } from './rail-runner.js';
import {
  chainIdForAgentChain,
  escrowContractAddressForAgentChain,
  isMantleAgentChain,
  normalizeAgentChain,
  tokenSymbolForAgentChain,
} from './chain-support.js';

/**
 * Sweep expired cosign queue entries and mark them as 'expired'.
 */
export async function sweepExpiredCosigns(log: Logger): Promise<void> {
  const now = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from('agent_cosign_queue')
    .select('id, agent_wallet_id, batch_payment_id, amount_usdc, recipient_address')
    .eq('status', 'pending')
    .lt('expires_at', now);

  if (error) {
    log.error({ error }, 'Failed to query expired cosign entries');
    return;
  }

  if (!expired || expired.length === 0) return;

  log.info({ count: expired.length }, 'Sweeping expired cosign entries');

  for (const entry of expired) {
    await supabase
      .from('agent_cosign_queue')
      .update({ status: 'expired' })
      .eq('id', entry.id);

    await supabase.from('agent_audit_log').insert({
      agent_wallet_id: entry.agent_wallet_id,
      batch_payment_id: entry.batch_payment_id,
      action: 'cosign_expired',
      recipient_address: entry.recipient_address,
      amount_usdc: entry.amount_usdc,
      outcome: 'blocked',
      reason: 'cosign_entry_expired',
    });

    await supabase
      .from('batch_payments')
      .update({ status: 'expired' })
      .eq('id', entry.batch_payment_id);
  }
}

/**
 * Process approved cosign entries — execute the transfer.
 */
export async function processApprovedCosigns(
  getRunnerForChain: (chain: string) => RailRunner | null,
  log: Logger,
): Promise<void> {
  const { data: approved, error } = await supabase
    .from('agent_cosign_queue')
    .select('*, agent_wallets!inner(escrow_address, chain, profile_wallet)')
    .eq('status', 'approved');

  if (error) {
    log.error({ error }, 'Failed to query approved cosign entries');
    return;
  }

  if (!approved || approved.length === 0) return;

  for (const entry of approved as any[]) {
    const chain = normalizeAgentChain(entry.agent_wallets?.chain);
    const configuredMantleEscrow = isMantleAgentChain(chain)
      ? escrowContractAddressForAgentChain(chain)
      : undefined;
    const escrowAddress = configuredMantleEscrow || entry.agent_wallets?.escrow_address;
    const profileWallet = entry.agent_wallets?.profile_wallet;

    if (!escrowAddress || !chain || !profileWallet) {
      log.error({ cosign_id: entry.id }, 'Missing escrow address for cosign entry');
      continue;
    }

    const runner = getRunnerForChain(chain);
    if (!runner) {
      log.error({ cosign_id: entry.id, chain }, 'No executor rail available for cosign chain');
      continue;
    }

    try {
      const result = await runner.walletTransfer({
        toAddress: entry.recipient_address,
        amount: entry.amount_usdc.toString(),
        fromAddress: escrowAddress,
        chain,
        metadata: {
          paymentId: entry.batch_payment_id,
          profileWallet,
          cosignId: entry.id,
        },
      });

      if (!result.txHash?.trim()) {
        throw new Error('Agent cosign transfer completed without a transaction hash');
      }

      // Mark cosign as completed (change status to distinguish from pending)
      await supabase
        .from('agent_cosign_queue')
        .update({ status: 'approved' }) // already approved, stays approved
        .eq('id', entry.id);

      await supabase.from('agent_audit_log').insert({
        agent_wallet_id: entry.agent_wallet_id,
        batch_payment_id: entry.batch_payment_id,
        action: 'cosign_execute',
        recipient_address: entry.recipient_address,
        amount_usdc: entry.amount_usdc,
        outcome: 'executed',
        tx_hash: result.txHash,
        circle_tx_id: result.circleTxId ?? null,
        metadata: { cosigned_by: entry.approved_by, ...(result.metadata ?? {}) },
      });

      await supabase.from('receipts').insert({
        sender: profileWallet,
        receiver: entry.recipient_address,
        amount: entry.amount_usdc,
        tx_hash: result.txHash,
        status: 'paid',
        initiator_type: 'agent',
        chain_id: chainIdForAgentChain(chain),
        token_symbol: tokenSymbolForAgentChain(chain),
      });

      await supabase
        .from('batch_payments')
        .update({ status: 'paid', tx_hash: result.txHash })
        .eq('id', entry.batch_payment_id);

      log.info({ cosign_id: entry.id, tx_hash: result.txHash }, 'Cosign entry executed');

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error({ cosign_id: entry.id, err: errMsg }, 'Cosign transfer failed');

      await supabase.from('agent_audit_log').insert({
        agent_wallet_id: entry.agent_wallet_id,
        batch_payment_id: entry.batch_payment_id,
        action: 'cosign_execute',
        recipient_address: entry.recipient_address,
        amount_usdc: entry.amount_usdc,
        outcome: 'failed',
        reason: errMsg,
      });
    }
  }
}
