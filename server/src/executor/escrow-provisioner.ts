import { supabase } from '../lib/supabase.js';
import type { CircleCliRunner } from './circle-cli.js';
import type { Logger } from 'pino';
import { randomUUID } from 'node:crypto';

/**
 * Checks for agent_wallets with executor_mode='escrow' but no escrow_address.
 * Creates an escrow wallet via the Circle CLI and updates the row.
 */
export async function provisionPendingEscrows(
  cli: CircleCliRunner,
  log: Logger,
): Promise<void> {
  const { data: pending, error } = await supabase
    .from('agent_wallets')
    .select('*')
    .eq('executor_mode', 'escrow')
    .is('escrow_address', null);

  if (error) {
    log.error({ error }, 'Failed to query pending escrow enrollments');
    return;
  }

  if (!pending || pending.length === 0) return;

  for (const wallet of pending) {
    log.info({ wallet_id: wallet.id }, 'Provisioning escrow wallet');
    try {
      const isTestnet = wallet.chain === 'ARC-TESTNET' ||
        wallet.chain.includes('SEPOLIA') ||
        wallet.chain.includes('TESTNET');

      const { address } = await cli.walletCreate({
        testnet: isTestnet,
        idempotencyKey: randomUUID(),
      });

      const { error: updateErr } = await supabase
        .from('agent_wallets')
        .update({ escrow_address: address })
        .eq('id', wallet.id);

      if (updateErr) {
        log.error({ wallet_id: wallet.id, error: updateErr }, 'Failed to update escrow address');
      } else {
        log.info({ wallet_id: wallet.id, escrow_address: address }, 'Escrow wallet provisioned');
      }
    } catch (err) {
      log.error({ wallet_id: wallet.id, err }, 'Failed to create escrow wallet');
    }
  }
}
