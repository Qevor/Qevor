import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

type RailEnvironment = 'testnet' | 'mainnet';

interface TransactionStatRow {
  chain_id: number | null;
  status: string | null;
  tx_hash: string | null;
  sender?: string | null;
  receiver?: string | null;
  payer_wallet?: string | null;
  recipient_wallet?: string | null;
}

interface TransactionStats {
  total: number;
  testnet: number;
  mainnet: number;
  activeUsers: number;
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

function addWallet(wallets: Set<string>, wallet?: string | null) {
  const normalized = wallet?.trim().toLowerCase();
  if (normalized) wallets.add(normalized);
}

router.get('/transactions', async (_req, res) => {
  const [receiptsResult, batchPaymentsResult, paymentLinksResult, profilesResult] = await Promise.all([
    supabase
      .from('receipts')
      .select('chain_id, status, tx_hash, sender, receiver')
      .not('tx_hash', 'is', null)
      .limit(5000),
    supabase
      .from('batch_payments')
      .select('chain_id, status, tx_hash, payer_wallet, recipient_wallet')
      .not('tx_hash', 'is', null)
      .limit(5000),
    supabase
      .from('payment_links')
      .select('creator_wallet, receiver_wallet')
      .limit(5000),
    supabase
      .from('profiles')
      .select('wallet')
      .limit(5000),
  ]);

  if (receiptsResult.error || batchPaymentsResult.error || paymentLinksResult.error || profilesResult.error) {
    res.status(500).json({
      error: 'Could not load Qevor transaction stats',
      details:
        receiptsResult.error?.message ??
        batchPaymentsResult.error?.message ??
        paymentLinksResult.error?.message ??
        profilesResult.error?.message,
    });
    return;
  }

  const stats: TransactionStats = { total: 0, testnet: 0, mainnet: 0, activeUsers: 0 };
  const seen = new Set<string>();
  const activeWallets = new Set<string>();

  for (const row of (receiptsResult.data ?? []) as TransactionStatRow[]) {
    addUniqueTransaction(stats, seen, row);
    addWallet(activeWallets, row.sender);
    addWallet(activeWallets, row.receiver);
  }
  for (const row of (batchPaymentsResult.data ?? []) as TransactionStatRow[]) {
    addUniqueTransaction(stats, seen, row);
    addWallet(activeWallets, row.payer_wallet);
    addWallet(activeWallets, row.recipient_wallet);
  }
  for (const row of (paymentLinksResult.data ?? []) as Array<{ creator_wallet?: string | null; receiver_wallet?: string | null }>) {
    addWallet(activeWallets, row.creator_wallet);
    addWallet(activeWallets, row.receiver_wallet);
  }
  for (const row of (profilesResult.data ?? []) as Array<{ wallet?: string | null }>) {
    addWallet(activeWallets, row.wallet);
  }

  stats.activeUsers = activeWallets.size;

  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json(stats);
});

export default router;
