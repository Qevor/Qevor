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

interface MantlescanTx {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  gasUsed?: string;
  gasPrice?: string;
  isError?: string;
  txreceipt_status?: string;
}

const router = Router();
const mantleMainnetChainId = 5000;
const mantleMainnetRpcUrl =
  process.env.MANTLE_MAINNET_RPC_URL ?? process.env.MANTLE_RPC_URL ?? 'https://rpc.mantle.xyz';

const chainEnvironmentById: Record<number, RailEnvironment> = {
  5042002: 'testnet',
  5003: 'testnet',
  [mantleMainnetChainId]: 'mainnet',
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

function isEvmAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function readBigInt(value?: string | null) {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}

function weiToMnt(wei: bigint) {
  const sign = wei < 0n ? -1 : 1;
  const abs = wei < 0n ? -wei : wei;
  const whole = abs / 1_000_000_000_000_000_000n;
  const fractional = (abs % 1_000_000_000_000_000_000n) / 1_000_000_000_000n;
  return sign * Number(`${whole}.${fractional.toString().padStart(6, '0')}`);
}

async function fetchMantleRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(mantleMainnetRpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mantle RPC responded ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message ?? `Mantle RPC ${method} failed`);
  }

  return payload.result as T;
}

async function getMantleWalletRpcSnapshot(rawAddress: string) {
  const [balanceHex, txCountHex] = await Promise.all([
    fetchMantleRpc<string>('eth_getBalance', [rawAddress, 'latest']),
    fetchMantleRpc<string>('eth_getTransactionCount', [rawAddress, 'latest']),
  ]);

  return {
    currentBalance: weiToMnt(readBigInt(balanceHex)),
    transactionCount: Number(readBigInt(txCountHex)),
  };
}

function buildMantleExplorerUrl(rawAddress: string) {
  const params = new URLSearchParams({
    chainid: String(mantleMainnetChainId),
    module: 'account',
    action: 'txlist',
    address: rawAddress,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: '1000',
    sort: 'desc',
  });

  const apiKey = process.env.ETHERSCAN_API_KEY ?? process.env.MANTLESCAN_API_KEY;
  if (apiKey) {
    params.set('apikey', apiKey);
  }

  return `https://api.etherscan.io/v2/api?${params.toString()}`;
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

router.get('/mantle-mainnet-wallet/:address', async (req, res) => {
  const rawAddress = req.params.address?.trim();

  if (!rawAddress || !isEvmAddress(rawAddress)) {
    res.status(400).json({ error: 'Invalid EVM address' });
    return;
  }

  const wallet = rawAddress.toLowerCase();

  try {
    const [response, rpcSnapshot] = await Promise.all([
      fetch(buildMantleExplorerUrl(rawAddress)),
      getMantleWalletRpcSnapshot(rawAddress),
    ]);

    if (!response.ok) {
      throw new Error(`Etherscan V2 responded ${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      message?: string;
      result?: MantlescanTx[] | string;
    };

    if (!Array.isArray(payload.result)) {
      const noTransactions =
        payload.status === '0' && /no transactions/i.test(String(payload.message ?? payload.result ?? ''));

      if (!noTransactions) {
        throw new Error(String(payload.result ?? payload.message ?? 'Unknown Mantlescan response'));
      }

      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        address: rawAddress,
        chainId: mantleMainnetChainId,
        transactions: rpcSnapshot.transactionCount,
        gasSpent: 0,
        amountReceived: rpcSnapshot.currentBalance,
        amountSent: 0,
        currentBalance: rpcSnapshot.currentBalance,
        source: 'mantle-rpc-fallback',
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    let receivedWei = 0n;
    let sentWei = 0n;
    let gasSpentWei = 0n;
    const seen = new Set<string>();

    for (const tx of payload.result) {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();

      if (from !== wallet && to !== wallet) continue;
      if (tx.isError === '1' || tx.txreceipt_status === '0') continue;

      const hash = tx.hash?.toLowerCase();
      if (hash) seen.add(hash);

      const valueWei = readBigInt(tx.value);

      if (to === wallet) {
        receivedWei += valueWei;
      }

      if (from === wallet) {
        sentWei += valueWei;
        gasSpentWei += readBigInt(tx.gasUsed) * readBigInt(tx.gasPrice);
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({
      address: rawAddress,
      chainId: mantleMainnetChainId,
      transactions: Math.max(seen.size, rpcSnapshot.transactionCount),
      gasSpent: weiToMnt(gasSpentWei),
      amountReceived: Math.max(weiToMnt(receivedWei), rpcSnapshot.currentBalance),
      amountSent: weiToMnt(sentWei),
      currentBalance: rpcSnapshot.currentBalance,
      source: 'etherscan-v2',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    try {
      const rpcSnapshot = await getMantleWalletRpcSnapshot(rawAddress);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        address: rawAddress,
        chainId: mantleMainnetChainId,
        transactions: rpcSnapshot.transactionCount,
        gasSpent: 0,
        amountReceived: rpcSnapshot.currentBalance,
        amountSent: 0,
        currentBalance: rpcSnapshot.currentBalance,
        source: 'mantle-rpc-fallback',
        fallbackReason: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      });
    } catch (rpcError) {
      console.error('Mantle mainnet wallet stats error:', error, rpcError);
      res.status(502).json({
        error: 'Could not load Mantle mainnet wallet stats',
        details: rpcError instanceof Error ? rpcError.message : String(rpcError),
      });
    }
  }
});

export default router;
