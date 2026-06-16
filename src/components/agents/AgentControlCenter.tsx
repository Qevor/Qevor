import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgentAuditEntry, AgentPolicy, AgentWallet, CosignQueueEntry } from '@/lib/agents/types';
import { fetchAuditLog, fetchCosignQueue, fetchPolicy } from '@/lib/agents/queries';
import { getQevorChainByAgentChain } from '@/lib/chains';
import { AgentWalletBalance } from './AgentWalletBalance';
import { AgentSafetyReview } from './AgentSafetyReview';

interface Props {
  wallets: AgentWallet[];
  onAddWallet: () => void;
  onEditPolicy: (wallet: AgentWallet) => void;
  onEnableExecutor: (wallet: AgentWallet) => void;
}

const truncate = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

export function AgentControlCenter({ wallets, onAddWallet, onEditPolicy, onEnableExecutor }: Props) {
  const [selectedId, setSelectedId] = useState(wallets[0]?.id ?? '');
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [recentActivity, setRecentActivity] = useState<AgentAuditEntry[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<CosignQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const selected = wallets.find((wallet) => wallet.id === selectedId) ?? wallets[0];
  const network = getQevorChainByAgentChain(selected?.chain);

  useEffect(() => {
    if (!wallets.some((wallet) => wallet.id === selectedId)) setSelectedId(wallets[0]?.id ?? '');
  }, [selectedId, wallets]);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const [nextPolicy, activity, approvals] = await Promise.all([
        fetchPolicy(selected.id),
        fetchAuditLog(selected.id, { limit: 6 }),
        fetchCosignQueue(selected.id, 'pending'),
      ]);
      setPolicy(nextPolicy);
      setRecentActivity(activity.entries);
      setPendingApprovals(approvals);
    } catch (error) {
      console.error('Failed to load agent control center:', error);
      toast.error('Could not refresh agent activity.');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Address copied');
  };

  const outcomeBadge = (outcome: AgentAuditEntry['outcome']) => {
    if (outcome === 'executed') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Executed</Badge>;
    if (outcome === 'cosign_required') return <Badge className="bg-amber-500 text-black hover:bg-amber-500">Cosign</Badge>;
    return <Badge variant="destructive">{outcome === 'blocked' ? 'Blocked' : 'Failed'}</Badge>;
  };

  if (!selected) return null;

  const activeEscrowAddress = network.agentEscrowAddress ?? selected.escrow_address;
  const executionAddress = activeEscrowAddress ?? selected.wallet_address;
  const isEscrowMode = !!activeEscrowAddress;
  const operational = selected.status === 'active' && selected.executor_mode === 'escrow' && isEscrowMode;

  return (
    <div className="space-y-6">
      <section className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-primary">
              <Bot className="h-4 w-4" />
              Agent Control Center
            </div>
            <h1 className="text-3xl font-semibold">Payment operations</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Review agent safety, control spending policy, and inspect every payment decision.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selected.id} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.label || 'Agent wallet'} - {truncate(wallet.wallet_address)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" title="Refresh agent data" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={onAddWallet}>
              <Plus className="mr-2 h-4 w-4" />
              Add wallet
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        {[
          {
            label: 'Agent status',
            value: operational ? 'Operational' : selected.status === 'active' ? 'Setup required' : selected.status,
            icon: operational ? CheckCircle2 : AlertTriangle,
            detail: operational ? 'Escrow executor active' : 'Complete executor setup',
          },
          {
            label: 'Network',
            value: network.label,
            icon: WalletCards,
            detail: network.paymentAsset,
          },
          {
            label: 'Safety policy',
            value: policy ? 'Active' : 'Not configured',
            icon: ShieldCheck,
            detail: policy?.max_per_tx_usdc ? `${policy.max_per_tx_usdc} max per payment` : 'Set spending controls',
          },
          {
            label: 'Pending approvals',
            value: String(pendingApprovals.length),
            icon: KeyRound,
            detail: pendingApprovals.length === 1 ? 'Payment needs review' : 'Payments need review',
          },
        ].map((item) => (
          <div key={item.label} className="min-w-0 bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {item.label}
              <item.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 truncate text-lg font-semibold">{item.value}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <div className="space-y-6">
          <AgentSafetyReview paymentAsset={network.paymentAsset} />

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="font-semibold">Recent decisions</h2>
                <p className="mt-1 text-sm text-muted-foreground">The latest executor outcomes for this agent.</p>
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="divide-y divide-border">
              {!loading && recentActivity.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">No agent decisions recorded yet.</p>
              )}
              {recentActivity.map((entry) => (
                <div key={entry.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.action}</span>
                      {outcomeBadge(entry.outcome)}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {entry.recipient_username ? `@${entry.recipient_username}` : entry.recipient_address || entry.reason || 'Agent decision'}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-medium">{entry.amount_usdc != null ? `${entry.amount_usdc} ${network.paymentAsset}` : '-'}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="font-semibold">{selected.label || 'Agent wallet'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{network.label} user-scoped execution account</p>
            </div>
            <div className="space-y-4 p-5">
              <AgentWalletBalance
                address={executionAddress}
                chain={selected.chain}
                ownerAddress={selected.profile_wallet}
                escrowMode={isEscrowMode}
              />
              {activeEscrowAddress && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Deposits to this escrow are credited to your connected wallet. Other users cannot see or spend your scoped balance.
                </p>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Wallet</span>
                  <button className="flex items-center gap-1 font-mono text-xs hover:text-primary" onClick={() => copy(selected.wallet_address)}>
                    {truncate(selected.wallet_address)} <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Escrow</span>
                  {activeEscrowAddress ? (
                    <button className="flex items-center gap-1 font-mono text-xs hover:text-primary" onClick={() => copy(activeEscrowAddress)}>
                      {truncate(activeEscrowAddress)} <Copy className="h-3 w-3" />
                    </button>
                  ) : <span className="text-xs text-amber-600">Not provisioned</span>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">ERC-8004 identity</span>
                  <span className="text-xs">{activeEscrowAddress ? 'Ready to link' : 'Requires escrow'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Byreal preflight</span>
                  <span className="text-xs">Server-side gate</span>
                </div>
              </div>
              <div className="grid gap-2 pt-2">
                <Button variant="outline" onClick={() => onEditPolicy(selected)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Edit safety policy
                </Button>
                {!selected.executor_mode && (
                  <Button onClick={() => onEnableExecutor(selected)}>
                    <Play className="mr-2 h-4 w-4" />
                    Enable autonomous execution
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <a href={`${network.explorerUrl}/address/${executionAddress}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on explorer
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="font-semibold">Policy snapshot</h2>
            </div>
            <div className="divide-y divide-border text-sm">
              {[
                ['Per-payment limit', policy?.max_per_tx_usdc],
                ['Daily limit', policy?.daily_cap_usdc],
                ['Cosign threshold', policy?.cosign_threshold_usdc],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{value != null ? `${value} ${network.paymentAsset}` : 'Not set'}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="text-muted-foreground">Duplicate protection</span>
                <span className="flex items-center gap-1 text-emerald-600"><FileCheck2 className="h-4 w-4" /> Active</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
