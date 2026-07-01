import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  Code2,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  Network,
  Receipt,
  Repeat,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wallet,
} from 'lucide-react';

const quickStarts = [
  {
    title: 'Create a payment link',
    body: 'Choose a rail, enter a recipient or username, set the amount, and share a checkout page that shows the network before the payer confirms.',
    href: '/create',
    action: 'Create link',
    icon: <Link2 className="h-5 w-5" />,
  },
  {
    title: 'Use the agent workspace',
    body: 'Describe the payment outcome in plain language. Qevor turns the prompt into a reviewable operation with safety checks.',
    href: '/dashboard?tab=agent',
    action: 'Open workspace',
    icon: <Bot className="h-5 w-5" />,
  },
  {
    title: 'Register an agent wallet',
    body: 'Connect a wallet, deploy or select an escrow, then register the agent wallet so autonomous execution remains scoped by policy.',
    href: '/agents',
    action: 'Agent operations',
    icon: <Wallet className="h-5 w-5" />,
  },
];

const concepts = [
  {
    title: 'Payment rails',
    body: 'Qevor routes payments through chain-aware rails. Mantle Mainnet is live, Mantle Sepolia remains available for testing, and every receipt stores network context.',
    icon: <Network className="h-5 w-5" />,
  },
  {
    title: 'Agent wallets',
    body: 'An agent wallet is a controlled payment operator. It can prepare or execute payments only inside the limits the user has defined.',
    icon: <Bot className="h-5 w-5" />,
  },
  {
    title: 'Escrowed balance',
    body: 'Users fund a scoped escrow instead of handing an AI agent unlimited access to their personal wallet. The agent can only spend what is available there.',
    icon: <LockKeyhole className="h-5 w-5" />,
  },
  {
    title: 'Policy checks',
    body: 'Policies define maximum amounts, approval thresholds, recipient rules, allowed networks, and other safety gates before funds move.',
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

const productSurfaces = [
  ['Agent Workspace', 'Prompt Qevor to plan one-time, batch, or recurring payments with safety review before execution.'],
  ['Payment Links', 'Generate shareable checkout links for one-off requests with memo, amount, recipient, and selected network.'],
  ['Batch Payments', 'Send to many recipients from one plan, with duplicate detection and receipt tracking for each recipient.'],
  ['Recurring Payments', 'Schedule agentic or human-approved payments with date, time, frequency, maximum runs, and execution policy.'],
  ['Receipts', 'Show who paid, who received funds, amount, network, status, timestamp, and transaction hash where available.'],
  ['Agent Operations', 'Register agent wallets, connect escrow contracts, set safety policies, review cosign queues, and inspect audit logs.'],
];

const safetyRules = [
  'Wrong-network warnings before users sign',
  'Duplicate recipient detection for batches',
  'Invalid wallet address validation',
  'Scoped escrow balances for agent execution',
  'Human approval thresholds for sensitive operations',
  'Audit logs for policy decisions and payment attempts',
  'Receipts with transaction hashes and settlement state',
  'Mainnet/Testnet rail separation for safer testing',
];

const agentFlow = [
  'User connects a wallet and registers an agent wallet.',
  'Qevor links the agent wallet to an escrow contract and identity metadata.',
  'The user funds the escrow and sets spending policy.',
  'The agent creates or receives a payment intent.',
  'Qevor checks amount, network, recipient, balance, and policy.',
  'If the policy passes, the agent can execute. If not, human approval is required or the payment is blocked.',
  'Qevor stores receipts, transaction hashes, and audit records.',
];

const roadmap = [
  {
    title: 'Gasless transactions',
    body: 'Coming soon: let Web2 users and agents complete selected flows without managing gas directly.',
  },
  {
    title: 'Fiat on-ramps',
    body: 'Coming soon: bridge card and bank-style onboarding into Mantle payment flows for non-crypto users.',
  },
  {
    title: 'Private payments',
    body: 'Coming soon: privacy-preserving payment options for teams and individuals who need discretion without losing accountability.',
  },
  {
    title: 'Cross-chain expansion',
    body: 'Coming soon: additional EVM rails so Qevor can route payments beyond Mantle while preserving one policy layer.',
  },
  {
    title: 'Agent API',
    body: 'Coming soon: programmatic endpoints for agent frameworks, DAOs, and apps that want to create payment intents from their own systems.',
  },
  {
    title: 'ERC-8004 identity support',
    body: 'In progress: deeper identity links so agent wallets can become more discoverable, verifiable, and interoperable.',
  },
];

const promptExamples = [
  'Create a 0.1 MNT payment request for @stellamaris on Mantle Mainnet.',
  'Pay these CSV recipients on Mantle, block duplicates, and require approval above 5 MNT.',
  'Schedule 0.25 MNT every Friday at 10:00 for this contributor, agent policy only if limits pass.',
  'Show me all receipts for Mantle Mainnet payments this week.',
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border/70 bg-card/20">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-20">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <BookOpen className="h-4 w-4" />
              Qevor Docs
            </div>
            <div className="space-y-5">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">
                Agentic payment infrastructure for Web2, Web3, and AI agents.
              </h1>
              <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
                Qevor lets users create payment links, send batches, schedule recurring payments, and delegate safe payment execution to AI agents through escrowed balances and policy checks.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/dashboard?tab=agent"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elegant hover-scale"
              >
                Open Agent Workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#quick-start"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
              >
                Start reading
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">What Qevor does</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ['Payment links', 'Request and receive MNT through shareable checkout pages.'],
                ['Batch payouts', 'Plan multi-recipient sends with validation and receipts.'],
                ['Agent escrow', 'Keep autonomous spending limited to scoped balances.'],
                ['Policy engine', 'Let agents execute only when rules pass.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-border bg-background/70 p-4">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-6 lg:grid-cols-[260px_1fr] lg:py-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">On this page</p>
            <nav className="mt-4 grid gap-2 text-sm">
              {[
                ['#quick-start', 'Quick start'],
                ['#concepts', 'Core concepts'],
                ['#payments', 'Payment flows'],
                ['#agents', 'Agent wallets'],
                ['#safety', 'Safety model'],
                ['#receipts', 'Receipts and audit'],
                ['#builders', 'Builder notes'],
                ['#roadmap', 'Coming soon'],
              ].map(([href, label]) => (
                <a key={href} href={href} className="rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="space-y-10">
          <DocSection id="quick-start" eyebrow="01" title="Quick Start">
            <div className="grid gap-4 lg:grid-cols-3">
              {quickStarts.map((item) => (
                <Link key={item.title} to={item.href} className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.icon}</div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {item.action}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </div>
          </DocSection>

          <DocSection id="concepts" eyebrow="02" title="Core Concepts">
            <div className="grid gap-4 sm:grid-cols-2">
              {concepts.map((item) => (
                <InfoCard key={item.title} icon={item.icon} title={item.title} body={item.body} />
              ))}
            </div>
          </DocSection>

          <DocSection id="payments" eyebrow="03" title="Payment Flows">
            <div className="grid gap-3">
              {productSurfaces.map(([title, body], index) => (
                <div key={title} className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-[48px_1fr]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </DocSection>

          <DocSection id="agents" eyebrow="04" title="Agent Wallets and Escrow">
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-base leading-relaxed text-muted-foreground">
                Qevor is designed for a future where AI agents can participate in real economic workflows without becoming unsafe signers. The user remains the owner. The agent becomes a payment operator with a bounded budget, known identity, and policy limits.
              </p>
              <div className="mt-6 grid gap-3">
                {agentFlow.map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-lg border border-border bg-background/70 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-foreground">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </DocSection>

          <DocSection id="safety" eyebrow="05" title="Safety Model">
            <div className="grid gap-3 sm:grid-cols-2">
              {safetyRules.map((rule) => (
                <div key={rule} className="flex gap-3 rounded-lg border border-border bg-card p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm leading-relaxed text-foreground">{rule}</span>
                </div>
              ))}
            </div>
          </DocSection>

          <DocSection id="receipts" eyebrow="06" title="Receipts and Audit">
            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard
                icon={<Receipt className="h-5 w-5" />}
                title="Receipts"
                body="Receipts give users a shareable record of the amount, recipient, sender, network, and settlement status."
              />
              <InfoCard
                icon={<FileText className="h-5 w-5" />}
                title="Audit logs"
                body="Agent operations record policy checks, approvals, blocked attempts, queued actions, and completed transactions."
              />
              <InfoCard
                icon={<Clock3 className="h-5 w-5" />}
                title="Recurring history"
                body="Scheduled payments track run count, next due time, execution mode, and each generated payment receipt."
              />
            </div>
          </DocSection>

          <DocSection id="builders" eyebrow="07" title="Builder Notes">
            <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="font-semibold text-foreground">Prompt examples</h3>
                </div>
                <div className="mt-5 space-y-3">
                  {promptExamples.map((prompt) => (
                    <code key={prompt} className="block rounded-lg border border-border bg-background/70 p-3 font-mono text-sm leading-relaxed text-foreground">
                      {prompt}
                    </code>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-primary">
                  <Code2 className="h-5 w-5" />
                  <h3 className="font-semibold text-foreground">Integration surface</h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Today, Qevor is an app-first payment workspace. The internal stack already separates payment links, batch payments, agent wallets, policy checks, receipts, and executor services so future APIs can expose those capabilities to outside agents and apps.
                </p>
                <div className="mt-5 grid gap-3">
                  {[
                    ['Frontend', 'React, Vite, Dynamic wallet auth, wagmi, viem'],
                    ['Database', 'Supabase tables for profiles, links, batches, receipts, policies, and recurring payments'],
                    ['Executor', 'Server-side workers for agent policy execution and scheduled payments'],
                    ['Contracts', 'Mantle escrow and agent identity registry support'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-background/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                      <p className="mt-1 text-sm text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DocSection>

          <DocSection id="roadmap" eyebrow="08" title="Coming Soon">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roadmap.map((item) => (
                <div key={item.title} className="rounded-lg border border-primary/25 bg-primary/10 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80 text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </DocSection>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Ready to try Qevor?</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Start with a payment link, then move into agent policies and scheduled payments when you need autonomy.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/create" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary/50">
                  Create link
                </Link>
                <Link to="/dashboard?tab=agent" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant">
                  Agent Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}

function DocSection({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5 flex items-center gap-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</span>
        <span className="h-px w-8 bg-border" />
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
