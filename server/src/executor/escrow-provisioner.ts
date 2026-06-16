import { supabase } from '../lib/supabase.js';
import type { RailRunner } from './rail-runner.js';
import type { Logger } from 'pino';
import { randomUUID } from 'node:crypto';
import { isMantleAgentChain, normalizeAgentChain } from './chain-support.js';

/**
 * Checks for agent_wallets with executor_mode='escrow' but no escrow_address.
 * Creates an escrow wallet via the rail runner and updates the row.
 */
export async function provisionPendingEscrows(
  getRunnerForChain: (chain: string) => RailRunner | null,
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
      const chain = normalizeAgentChain(wallet.chain);
      const runner = getRunnerForChain(chain);
      if (!runner) {
        log.error({ wallet_id: wallet.id, chain }, 'No executor rail for wallet chain');
        continue;
      }

      const configuredMantleEscrow = isMantleAgentChain(chain)
        ? process.env.MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS?.trim()
        : undefined;
      const { address } = configuredMantleEscrow
        ? { address: configuredMantleEscrow }
        : await runner.walletCreate({
            testnet: chain.includes('SEPOLIA') || chain.includes('TESTNET'),
            idempotencyKey: randomUUID(),
            chain,
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
