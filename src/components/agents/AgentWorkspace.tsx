import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileCheck2,
  KeyRound,
  Link2,
  Loader2,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getQevorChainByKey } from '@/lib/chains';
import type { PaymentIntentPlan } from '@/lib/agents/intent-planner';

interface Props {
  intent: string;
  plan: PaymentIntentPlan | null;
  planning: boolean;
  agentWalletCount: number;
  importedRecipientCount: number;
  onIntentChange: (intent: string) => void;
  onCsvImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlan: () => void;
  onOpenPlan: () => void;
}

const suggestions = [
  'Pay these CSV recipients on Mantle, block duplicates, and require my approval.',
  'Prepare a contributor payout with a maximum total of 20 MNT.',
  'Create a payment plan and recommend whether an agent should execute it.',
];

export function AgentWorkspace({
  intent,
  plan,
  planning,
  agentWalletCount,
  importedRecipientCount,
  onIntentChange,
  onCsvImport,
  onPlan,
  onOpenPlan,
}: Props) {
  return (
    <div className="space-y-6">
      <section className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-primary">
              <Bot className="h-4 w-4" />
              Agent-first payment workspace
            </div>
            <h1 className="text-3xl font-semibold sm:text-4xl">What should Qevor accomplish?</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Give Qevor an outcome. The agent prepares the payment operation, selects a rail, applies policy, and waits for the required approval.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/agents">
              <ShieldCheck className="h-4 w-4" />
              Manage agent policy
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="rounded-lg border border-primary/30 bg-card">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Command Qevor
            </div>
            <p className="mt-1 text-sm text-muted-foreground">The agent creates a reviewable plan. It never bypasses deterministic policy or approval gates.</p>
          </div>
          <div className="space-y-4 p-5">
            <textarea
              value={intent}
              onChange={(event) => onIntentChange(event.target.value)}
              className="min-h-36 w-full resize-y rounded-lg border border-input bg-background p-4 text-base outline-none focus:ring-2 focus:ring-primary"
              placeholder="Example: Pay the imported contributor list on Mantle, block duplicates, and require my approval above 10 MNT."
            />
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onIntentChange(suggestion)}
                  className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
              <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                <Upload className="h-4 w-4" />
                {importedRecipientCount > 0
                  ? `${importedRecipientCount} CSV recipient${importedRecipientCount === 1 ? '' : 's'} imported`
                  : 'Import recipient CSV'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={onCsvImport}
                />
              </label>
              <Button className="w-full sm:w-auto" onClick={onPlan} disabled={planning || intent.trim().length < 3}>
                {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Build operation plan
              </Button>
              <span className="text-xs text-muted-foreground">
                Format: address, amount, label
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold">Agent readiness</h2>
            <p className="mt-1 text-sm text-muted-foreground">Every operation follows this control path.</p>
          </div>
          <div className="divide-y divide-border">
            {[
              [Sparkles, 'Intent planner', 'Ready'],
              [ShieldCheck, 'Safety and policy', 'Always enforced'],
              [KeyRound, 'Human approval', 'Required by default'],
              [WalletCards, 'Autonomous wallets', agentWalletCount > 0 ? `${agentWalletCount} configured` : 'Setup required'],
            ].map(([Icon, label, value]) => {
              const StatusIcon = Icon as typeof Bot;
              return (
                <div key={String(label)} className="flex items-center justify-between gap-4 p-4">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <StatusIcon className="h-4 w-4 text-primary" /> {String(label)}
                  </span>
                  <span className="text-right text-sm font-medium">{String(value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {plan && (
        <section className="rounded-lg border border-primary/30 bg-primary/5">
          <div className="flex flex-col gap-4 border-b border-primary/20 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{plan.title}</h2>
                <span className="rounded-md border border-primary/30 bg-background px-2 py-1 text-[10px] font-semibold uppercase text-primary">
                  {plan.source === 'openai' ? 'AI planned' : 'Locally planned'}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.explanation}</p>
              {plan.executionLayer && (
                <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                  plan.executionLayer.configured && plan.executionLayer.allowed
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500'
                    : plan.executionLayer.configured
                      ? 'border-destructive/30 bg-destructive/5 text-destructive'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-500'
                }`}>
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <Bot className="h-3.5 w-3.5" />
                    Byreal execution layer
                    <span className="rounded bg-background/80 px-1.5 py-0.5 uppercase">
                      {plan.executionLayer.configured
                        ? plan.executionLayer.allowed ? 'preflight passed' : 'blocked'
                        : 'not configured'}
                    </span>
                  </div>
                  {plan.executionLayer.reason && <p className="mt-1 text-muted-foreground">{plan.executionLayer.reason}</p>}
                </div>
              )}
            </div>
            <Button onClick={onOpenPlan}>
              Review and approve
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-px bg-primary/20 sm:grid-cols-4">
            {[
              ['Rail', getQevorChainByKey(plan.chainKey).label],
              ['Recipients', String(plan.recipients.length)],
              ['Execution', plan.executionMode === 'agent' ? 'Agent requested' : 'Human wallet'],
              ['Approval', 'Required'],
            ].map(([label, value]) => (
              <div key={label} className="bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {plan.warnings.length > 0 && (
            <div className="space-y-1 border-t border-primary/20 px-5 py-4">
              {plan.warnings.map((warning) => <p key={warning} className="text-xs text-amber-500">{warning}</p>)}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold">Execution rails</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use a rail directly when you already know the exact action.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['/send', Send, 'Direct send', 'One recipient'],
            ['/dashboard?tab=batch', FileCheck2, 'Batch payout', 'CSV or manual rows'],
            ['/dashboard?tab=links', Link2, 'Payment request', 'Shareable payment link'],
            ['/dashboard?tab=receipts', Receipt, 'Receipts', 'Verify outcomes'],
          ].map(([to, Icon, title, detail]) => {
            const RailIcon = Icon as typeof Bot;
            return (
              <Link key={String(title)} to={String(to)} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
                <RailIcon className="h-5 w-5 text-primary" />
                <p className="mt-4 font-semibold">{String(title)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{String(detail)}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Agent plans remain drafts until policy checks and the required approval succeed.
      </div>
    </div>
  );
}
