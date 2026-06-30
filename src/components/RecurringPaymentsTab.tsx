import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pause, Play, Plus, RefreshCw, Repeat, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChainEnvironmentToggle } from '@/components/ChainEnvironmentToggle';
import { useProfiles } from '@/hooks/useProfiles';
import { fetchAgentWallets } from '@/lib/agents/queries';
import type { AgentWallet } from '@/lib/agents/types';
import {
  type RecurringPayment,
  type RecurringFrequency,
  useRecurringPayments,
} from '@/hooks/useRecurringPayments';
import {
  getDefaultQevorChainForEnvironment,
  getQevorChainByAgentChain,
  getQevorChainById,
  getQevorChainByKey,
  getQevorChainsByEnvironment,
  type QevorChainEnvironment,
  type QevorChainKey,
} from '@/lib/chains';
import { cn } from '@/lib/utils';

interface RecurringPaymentsTabProps {
  wallet: string;
}

function addInterval(date: Date, frequency: RecurringFrequency, count: number) {
  const next = new Date(date);
  if (frequency === 'daily') next.setDate(next.getDate() + count);
  if (frequency === 'weekly') next.setDate(next.getDate() + (count * 7));
  if (frequency === 'monthly') next.setMonth(next.getMonth() + count);
  return next;
}

function getFrequencyLabel(payment: RecurringPayment) {
  const base = payment.frequency === 'daily' ? 'day' : payment.frequency === 'weekly' ? 'week' : 'month';
  return payment.interval_count === 1 ? `Every ${base}` : `Every ${payment.interval_count} ${base}s`;
}

function getStatusClasses(status: RecurringPayment['status']) {
  if (status === 'active') return 'border-green-500/25 bg-green-500/10 text-green-300';
  if (status === 'paused') return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300';
  if (status === 'complete') return 'border-primary/25 bg-primary/10 text-primary';
  return 'border-muted bg-muted/30 text-muted-foreground';
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatLocalDateTimeInput(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-') + `T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function hasConfiguredAgentEscrow(wallet: AgentWallet) {
  const network = getQevorChainByAgentChain(wallet.chain);
  return wallet.executor_mode === 'escrow' && !!(network.agentEscrowAddress ?? wallet.escrow_address);
}

export function RecurringPaymentsTab({ wallet }: RecurringPaymentsTabProps) {
  const [plans, setPlans] = useState<RecurringPayment[]>([]);
  const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [environment, setEnvironment] = useState<QevorChainEnvironment>('mainnet');
  const [chainKey, setChainKey] = useState<QevorChainKey>(() => getDefaultQevorChainForEnvironment('mainnet').key);
  const [title, setTitle] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [intervalCount, setIntervalCount] = useState('1');
  const [startAt, setStartAt] = useState(() => formatLocalDateTimeInput());
  const [maxRuns, setMaxRuns] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedAgentWalletId, setSelectedAgentWalletId] = useState('');
  const { getRecurringPaymentsByWallet, createRecurringPayment, updateRecurringStatus, loading } = useRecurringPayments();
  const { resolveUsernameToWallet } = useProfiles();

  const selectedNetwork = getQevorChainByKey(chainKey);
  const networks = getQevorChainsByEnvironment(environment);
  const eligibleAgentWallets = agentWallets.filter((agentWallet) => agentWallet.chain === selectedNetwork.agentChainCode);

  const loadPlans = async () => {
    const rows = await getRecurringPaymentsByWallet(wallet);
    setPlans(rows);
  };

  useEffect(() => {
    loadPlans();
  }, [wallet]);

  useEffect(() => {
    fetchAgentWallets(wallet)
      .then((rows) => setAgentWallets(rows.filter(hasConfiguredAgentEscrow)))
      .catch(() => setAgentWallets([]));
  }, [wallet]);

  useEffect(() => {
    if (eligibleAgentWallets.some((agentWallet) => agentWallet.id === selectedAgentWalletId)) return;
    setSelectedAgentWalletId(eligibleAgentWallets[0]?.id ?? '');
  }, [eligibleAgentWallets, selectedAgentWalletId]);

  const summary = useMemo(() => {
    return plans.reduce(
      (acc, plan) => {
        const network = getQevorChainById(plan.chain_id);
        if (plan.status === 'active') acc.active += 1;
        if (network.environment === 'mainnet') acc.mainnet += 1;
        if (network.environment === 'testnet') acc.testnet += 1;
        acc.totalAmount += Number(plan.amount);
        return acc;
      },
      { active: 0, mainnet: 0, testnet: 0, totalAmount: 0 },
    );
  }, [plans]);

  const handleEnvironmentChange = (nextEnvironment: QevorChainEnvironment) => {
    setEnvironment(nextEnvironment);
    setChainKey(getDefaultQevorChainForEnvironment(nextEnvironment).key);
  };

  const resetForm = () => {
    setTitle('');
    setRecipient('');
    setAmount('');
    setFrequency('monthly');
    setIntervalCount('1');
    setStartAt(formatLocalDateTimeInput());
    setMaxRuns('');
    setMemo('');
    setSelectedAgentWalletId('');
    setEnvironment('mainnet');
    setChainKey(getDefaultQevorChainForEnvironment('mainnet').key);
  };

  const handleCreate = async () => {
    const parsedAmount = Number(amount);
    const parsedInterval = Math.max(1, Number(intervalCount || 1));
    const parsedMaxRuns = maxRuns ? Number(maxRuns) : null;
    const startsAt = new Date(startAt);

    if (!recipient.trim()) return toast.error('Add a recipient wallet or username.');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error('Enter a valid recurring amount.');
    if (!Number.isFinite(parsedInterval) || parsedInterval <= 0) return toast.error('Interval must be at least 1.');
    if (parsedMaxRuns !== null && (!Number.isFinite(parsedMaxRuns) || parsedMaxRuns <= 0)) {
      return toast.error('Max payments must be a positive number.');
    }
    if (Number.isNaN(startsAt.getTime())) return toast.error('Choose a valid start date and time.');
    if (!selectedAgentWalletId) {
      return toast.error(`Add or select a ${selectedNetwork.label} agent wallet before creating an agentic recurring plan.`);
    }

    let receiverWallet = recipient.trim();
    if (!receiverWallet.startsWith('0x') || receiverWallet.length !== 42) {
      const resolved = await resolveUsernameToWallet(receiverWallet);
      if (!resolved) return toast.error(`Could not resolve ${receiverWallet}.`);
      receiverWallet = resolved;
    }

    const created = await createRecurringPayment({
      creator_wallet: wallet,
      receiver_wallet: receiverWallet,
      amount: parsedAmount,
      chain_id: selectedNetwork.chain.id,
      token_symbol: selectedNetwork.paymentAsset,
      frequency,
      interval_count: parsedInterval,
      start_at: startsAt.toISOString(),
      next_run_at: startsAt.toISOString(),
      max_runs: parsedMaxRuns,
      title: title.trim() || null,
      memo: memo.trim() || null,
      execution_mode: 'agent',
      executor_agent_wallet_id: selectedAgentWalletId,
    });

    if (!created) {
      toast.error('Could not create recurring payment. Run the latest Supabase migration if this is live.');
      return;
    }

    toast.success('Recurring payment plan created.');
    setIsCreateOpen(false);
    resetForm();
    loadPlans();
  };

  const handleStatus = async (plan: RecurringPayment, status: RecurringPayment['status']) => {
    const updated = await updateRecurringStatus(plan.id, status);
    if (!updated) {
      toast.error('Could not update recurring payment.');
      return;
    }
    toast.success(`Recurring payment ${status}.`);
    loadPlans();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Subscriptions & recurring payments</h2>
          <p className="text-muted-foreground">
            Schedule repeat payments for payroll, retainers, dues, invoices, and subscriptions.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New recurring plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create agentic recurring payment</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                Qevor stores the exact schedule and queues each due payment through your agent wallet policy.
                The executor picks it up only when the selected agent wallet and policy are configured.
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recurring-title">Title</Label>
                  <Input
                    id="recurring-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Monthly contributor payout"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-recipient">Recipient</Label>
                  <Input
                    id="recurring-recipient"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="0x... or @username"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="recurring-amount">Amount</Label>
                  <Input
                    id="recurring-amount"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-frequency">Frequency</Label>
                  <select
                    id="recurring-frequency"
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-interval">Every</Label>
                  <Input
                    id="recurring-interval"
                    type="number"
                    min="1"
                    value={intervalCount}
                    onChange={(event) => setIntervalCount(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Rail environment</Label>
                  <ChainEnvironmentToggle value={environment} onChange={handleEnvironmentChange} className="w-full" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-network">Network</Label>
                  <select
                    id="recurring-network"
                    value={chainKey}
                    onChange={(event) => setChainKey(event.target.value as QevorChainKey)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {networks.map((network) => (
                      <option key={network.key} value={network.key}>
                        {network.label} ({network.paymentAsset})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="recurring-start">Start date and time</Label>
                  <Input
                    id="recurring-start"
                    type="datetime-local"
                    value={startAt}
                    onChange={(event) => setStartAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-max">Max payments</Label>
                  <Input
                    id="recurring-max"
                    type="number"
                    min="1"
                    value={maxRuns}
                    onChange={(event) => setMaxRuns(event.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-agent">Agent wallet</Label>
                  <select
                    id="recurring-agent"
                    value={selectedAgentWalletId}
                    onChange={(event) => setSelectedAgentWalletId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {eligibleAgentWallets.length === 0 ? (
                      <option value="">No eligible agent wallet</option>
                    ) : (
                      eligibleAgentWallets.map((agentWallet) => (
                        <option key={agentWallet.id} value={agentWallet.id}>
                          {agentWallet.label || 'Agent wallet'} ({agentWallet.wallet_address.slice(0, 6)}...{agentWallet.wallet_address.slice(-4)})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recurring-memo">Memo</Label>
                <Textarea
                  id="recurring-memo"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="Optional note for receipts and audit history"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={loading}>
                  {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Repeat className="mr-2 h-4 w-4" />}
                  Create plan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Active plans', summary.active],
          ['Mainnet plans', summary.mainnet],
          ['Testnet plans', summary.testnet],
          ['Scheduled amount', summary.totalAmount.toFixed(2)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/80 px-6 py-16 text-center">
          <CalendarClock className="mx-auto h-10 w-10 text-primary" />
          <h3 className="mt-4 text-xl font-semibold">No recurring payments yet</h3>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Create a plan for subscriptions, repeat invoices, monthly grants, team retainers, or autonomous agent payouts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => {
            const network = getQevorChainById(plan.chain_id);
            const isCreator = plan.creator_wallet.toLowerCase() === wallet.toLowerCase();
            const nextRun = new Date(plan.next_run_at);
            const estimatedNext = addInterval(nextRun, plan.frequency, plan.interval_count);
            return (
              <div key={plan.id} className="rounded-2xl border border-border bg-card/80 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">{plan.title || 'Recurring payment'}</h3>
                      <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', getStatusClasses(plan.status))}>
                        {plan.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isCreator ? 'Outgoing from you' : 'Incoming to you'} on {network.label}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-xl font-bold">
                    {plan.amount.toFixed(4)} <span className="text-sm text-primary">{plan.token_symbol}</span>
                  </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background/35 p-3">
                    <p className="text-xs text-muted-foreground">Recipient</p>
                    <p className="mt-1 truncate font-mono text-sm">{plan.receiver_wallet}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/35 p-3">
                    <p className="text-xs text-muted-foreground">Schedule</p>
                    <p className="mt-1 text-sm font-semibold">{getFrequencyLabel(plan)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/35 p-3">
                    <p className="text-xs text-muted-foreground">Next due</p>
                    <p className="mt-1 text-sm font-semibold">{nextRun.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/35 p-3">
                    <p className="text-xs text-muted-foreground">Execution</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {plan.execution_mode === 'agent' ? 'Agent policy' : 'Human approval'}
                    </p>
                  </div>
                </div>

                {plan.memo && <p className="mt-4 text-sm text-muted-foreground">{plan.memo}</p>}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    {plan.run_count} paid{plan.max_runs ? ` of ${plan.max_runs}` : ''} - Next after this: {estimatedNext.toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    {plan.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => handleStatus(plan, 'paused')} disabled={loading}>
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                        Pause
                      </Button>
                    ) : plan.status === 'paused' ? (
                      <Button variant="outline" size="sm" onClick={() => handleStatus(plan, 'active')} disabled={loading}>
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Resume
                      </Button>
                    ) : null}
                    {plan.status !== 'cancelled' && plan.status !== 'complete' && (
                      <Button variant="outline" size="sm" onClick={() => handleStatus(plan, 'cancelled')} disabled={loading}>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
