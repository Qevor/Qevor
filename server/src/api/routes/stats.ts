import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

type RailEnvironment = 'testnet' | 'mainnet';

interface TransactionStatRow {
  chain_id: number | null;
  status: string | null;
  tx_hash: string | null;
}

interface TransactionStats {
  total: number;
  testnet: number;
  mainnet: number;
}

const router = Router();

const chainEnvironmentById: Record<number, RailEnvironment> = {
  5042002: 'testnet',
  5003: 'testnet',
  5000: 'mainnet',
};

const inactiveStatuses = new Set(['pending', 'queued', 'failed', 'cancelled', 'canceled']);

function getRailEnvironment(chainId: number | null): RailEnvironment {
  if (!chainId) return 'testnet';
  return chainEnvironmentById[chainId] ?? 'testnet';
}

function isCompletedTransaction(row: TransactionStatRow) {
  const status = row.status?.toLowerCase() ?? '';
  return Boolean(row.tx_hash?.trim()) && !inactiveStatuses.has(status);
}

function addUniqueTransaction(stats: TransactionStats, seen: Set<string>, row: TransactionStatRow) {
  if (!isCompletedTransaction(row)) return;

  const environment = getRailEnvironment(row.chain_id);
  const hash = row.tx_hash?.trim().toLowerCase();
  if (!hash) return;

  const key = `${environment}:${hash}`;
  if (seen.has(key)) return;

  seen.add(key);
  stats.total += 1;
  stats[environment] += 1;
}

router.get('/transactions', async (_req, res) => {
  const [receiptsResult, batchPaymentsResult] = await Promise.all([
    supabase
      .from('receipts')
      .select('chain_id, status, tx_hash')
      .not('tx_hash', 'is', null)
      .limit(5000),
    supabase
      .from('batch_payments')
      .select('chain_id, status, tx_hash')
      .not('tx_hash', 'is', null)
      .limit(5000),
  ]);

  if (receiptsResult.error || batchPaymentsResult.error) {
    res.status(500).json({
      error: 'Could not load Qevor transaction stats',
      details: receiptsResult.error?.message ?? batchPaymentsResult.error?.message,
    });
    return;
  }

  const stats: TransactionStats = { total: 0, testnet: 0, mainnet: 0 };
  const seen = new Set<string>();

  for (const row of (receiptsResult.data ?? []) as TransactionStatRow[]) {
    addUniqueTransaction(stats, seen, row);
  }
  for (const row of (batchPaymentsResult.data ?? []) as TransactionStatRow[]) {
    addUniqueTransaction(stats, seen, row);
  }

  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json(stats);
});

export default router;
