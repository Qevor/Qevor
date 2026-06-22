import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Link2,
  LockKeyhole,
  Network,
  Repeat,
  ShieldCheck,
  Share2,
  UploadCloud,
  Wallet,
} from 'lucide-react';

const samplePrompts = [
  'Pay these CSV recipients on Mantle Mainnet, block duplicates, and require my approval.',
  'Create a 5 MNT payment request for @maris on Mantle Mainnet.',
  'Prepare a recurring contributor payout every Friday, max 20 MNT, agent execution allowed only if policy passes.',
  'Scan this batch for duplicate addresses and wrong-chain risk before I approve.',
];

const safetyChecks = [
  'Duplicate recipient detection',
  'Invalid wallet address checks',
  'Wrong-chain and mainnet risk warnings',
  'High total amount and low balance checks',
  'Saved policy limits before agent execution',
  'Receipt and history records after payment',
];

const trackFit = [
  {
    name: 'Minds',
    detail: 'Qevor Pay is a public capability with clear prompts, rules, and an agent guide another user can follow.',
  },
  {
    name: 'Animoca Brands',
    detail: 'Shareable links, public receipts, and team payout flows make Qevor usable by creators, communities, and teams.',
  },
  {
    name: 'OpenCheck',
    detail: 'Every payment plan is checked for risk before funds move, then recorded with network and receipt metadata.',
  },
];

const demoSteps = [
  'Open Qevor and connect a wallet.',
  'Use the Mainnet/Testnet rail control to choose the payment environment.',
  'Import a CSV or write a payment instruction in the Agent Workspace.',
  'Let Qevor scan recipients, amounts, chain, and policy.',
  'Approve manually or let an eligible agent wallet execute within policy.',
  'Open receipts, wallet history, and agent operation records.',
];

export default function AgentGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Bot className="h-4 w-4" />
              Qevor Pay Capability
            </div>
            <div className="space-y-5">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">
                Qevor Pay is the agent-first payment capability for Mantle.
              </h1>
              <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
                Tell Qevor who to pay, how much, and on which rail. Qevor checks safety, policy, and prepares the payment.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/dashboard?tab=agent"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elegant hover-scale"
              >
                Command Qevor
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/dashboard?tab=wallet"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
              >
                Open payment rails
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Activation message</p>
            <div className="mt-4 rounded-lg border border-primary/25 bg-primary/10 p-5">
              <p className="text-lg font-semibold leading-relaxed text-foreground">
                Tell Qevor who to pay, how much, and on which rail. Qevor checks safety, policy, and prepares the payment.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ['Default rail', 'Mantle Mainnet'],
                ['Sandbox rail', 'Mantle Sepolia'],
                ['Approval', 'Policy controlled'],
                ['CSV', 'address, amount, label'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                  <p className="mt-2 font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <GuideCard
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="How to invoke it"
            body="Use plain language. Qevor turns the instruction into a reviewable payment plan before anything moves."
          />
          <GuideCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="What it checks"
            body="The safety copilot scans recipients, amounts, selected rail, approval requirements, and saved policy."
          />
          <GuideCard
            icon={<Wallet className="h-5 w-5" />}
            title="How it executes"
            body="Human wallet approval is always available. Autonomous execution only works with an eligible agent wallet and policy."
          />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold text-foreground">Sample Prompts</h2>
            <div className="mt-5 space-y-3">
              {samplePrompts.map((prompt) => (
                <div key={prompt} className="rounded-lg border border-border bg-background/70 p-4 font-mono text-sm leading-relaxed text-foreground">
                  {prompt}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold text-foreground">Payment Inputs</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <UploadCloud className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-foreground">CSV batches</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Import contributor, payroll, creator, or team payout lists.
                </p>
                <code className="mt-4 block rounded-lg bg-secondary px-3 py-2 text-xs text-foreground">
                  address,amount,label
                </code>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <Link2 className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-foreground">Payment links</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Create shareable payment requests for wallets or Qevor usernames.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <Repeat className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-foreground">Recurring payments</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Prepare subscription-style or scheduled payouts with policy limits.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <Share2 className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-foreground">Receipts</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Show proof of payment, chain, amount, and operation status.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold text-foreground">Safety Rules</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {safetyChecks.map((check) => (
                <div key={check} className="flex items-start gap-3 rounded-lg border border-border bg-background/70 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm leading-relaxed text-foreground">{check}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold text-foreground">Mainnet, Testnet, Autonomous Mode</h2>
            <div className="mt-5 space-y-4">
              <GuideRow
                icon={<Network className="h-5 w-5" />}
                title="Mantle Mainnet is default"
                body="Qevor now starts on the real payment rail, while the interface keeps testnet available as a sandbox."
              />
              <GuideRow
                icon={<LockKeyhole className="h-5 w-5" />}
                title="Autonomous does not mean uncontrolled"
                body="Agent execution requires a registered agent wallet, scoped balances, and policy checks before it can run without asking for a fresh wallet signature."
              />
              <GuideRow
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Human approval stays available"
                body="Users can keep manual signing for high-risk, first-time, or mainnet operations."
              />
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-lg border border-border bg-card p-6">
          <h2 className="text-2xl font-semibold text-foreground">Consumer Track Fit</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {trackFit.map((item) => (
              <div key={item.name} className="rounded-lg border border-border bg-background/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{item.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-lg border border-primary/30 bg-primary/10 p-6">
          <h2 className="text-2xl font-semibold text-foreground">What Judges Should Test</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {demoSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-lg bg-background/70 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function GuideCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function GuideRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-4 rounded-lg border border-border bg-background/70 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
