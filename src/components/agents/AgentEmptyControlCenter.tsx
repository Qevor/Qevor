import { Bot, CheckCircle2, CircleDashed, Plus, ShieldCheck, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentSafetyReview } from './AgentSafetyReview';

interface Props {
  onAddWallet: () => void;
}

export function AgentEmptyControlCenter({ onAddWallet }: Props) {
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
              Start with the safety copilot, then register an agent wallet to enable policy-controlled execution.
            </p>
          </div>
          <Button onClick={onAddWallet}>
            <Plus className="mr-2 h-4 w-4" />
            Add agent wallet
          </Button>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        {[
          ['Agent wallet', 'Not registered', WalletCards],
          ['Safety copilot', 'Ready', ShieldCheck],
          ['Spending policy', 'Waiting for wallet', CircleDashed],
          ['On-chain decisions', 'Waiting for escrow', CheckCircle2],
        ].map(([label, value, Icon]) => {
          const StatusIcon = Icon as typeof Bot;
          return (
            <div key={String(label)} className="bg-card p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {label}
                <StatusIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-lg font-semibold">{value}</div>
            </div>
          );
        })}
      </section>

      <AgentSafetyReview />
    </div>
  );
}
