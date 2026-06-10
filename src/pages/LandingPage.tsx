import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Copy,
  Github,
  Layers,
  Link2,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Twitter,
  UploadCloud,
  Users,
} from 'lucide-react';
import { getQevorChainByKey, qevorChains, type QevorChainKey } from '@/lib/chains';
import { ThemeToggle } from '@/components/ThemeToggle';

const SectionLabel = ({ n, label }: { n: string; label: string }) => (
  <div className="mb-6 flex items-center gap-3">
    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{n}</span>
    <span className="inline-block h-px w-10 bg-border" />
    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
  </div>
);

const MOCK: Record<string, string> = {
  aria: '0x9aF3b2C18d44E71fA3c21Bc8f0d0a3c221c4f2B',
  bola: '0x4dB2a1F09e3C8b0f7e2A45d6C1b9E3f0a1D2c3E',
  'dao-treasury': '0x7Fe3c0E2d1b4A6F9e8D3c2A5B0f1E4d7C3b2A1D',
  satoshi: '0x1A2b3C4d5E6f7A8B9c0D1e2F3a4B5c6D7e8F9a0B',
};

const MARQUEE_ITEMS = [
  'Multi-chain payout confirmed',
  'Batch import scanned for duplicate addresses',
  'Payment link paid on the selected network',
  '10 recipients, 1 signature',
  'Receipt sealed with chain metadata',
  'Agent policy simulation passed',
  'Mainnet mode locked behind safety checks',
  'Payment link shared to customer',
];

export default function LandingPage() {
  const [handle, setHandle] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [chainKey, setChainKey] = useState<QevorChainKey>('mantle-sepolia');
  const [copied, setCopied] = useState(false);
  const [resolveHandle, setResolveHandle] = useState('');
  const [resolved, setResolved] = useState<{ handle: string; address: string } | null>(null);
  const [resolveError, setResolveError] = useState('');
  const tryRef = useRef<HTMLDivElement>(null);

  const selectedNetwork = getQevorChainByKey(chainKey);
  const payLink = handle
    ? `https://qevor.vercel.app/pay?to=${handle}&amount=${amount || '0'}&chain=${selectedNetwork.key}${memo ? `&memo=${encodeURIComponent(memo)}` : ''}`
    : '';

  const copyLink = () => {
    if (!payLink) return;
    navigator.clipboard.writeText(payLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const doResolve = (e: React.FormEvent) => {
    e.preventDefault();
    const key = resolveHandle.replace('@', '').toLowerCase();
    if (MOCK[key]) {
      setResolved({ handle: key, address: MOCK[key] });
      setResolveError('');
      return;
    }

    setResolved(null);
    setResolveError('Handle not found');
  };

  const useInLink = () => {
    if (!resolved) return;
    setHandle(resolved.handle);
    tryRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Qevor" className="h-8 w-8 rounded object-cover qevor-logo-pulse" />
            <span className="text-lg font-semibold text-foreground">Qevor</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {[
              ['#product', 'Product'],
              ['#safety', 'Safety'],
              ['#try', 'Try it'],
              ['#networks', 'Networks'],
              ['#start', 'Start'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/dashboard?tab=agent"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elegant hover-scale"
            >
              <Bot className="h-4 w-4" />
              Agent Workspace
            </Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,hsl(var(--background))_0%,hsl(var(--background)/0.92)_38%,hsl(191_100%_12%/0.42)_70%,hsl(151_70%_16%/0.28)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-5 py-20 sm:px-6 lg:py-24">
          <div className="max-w-4xl">
            <div className="mb-7 flex flex-wrap items-center gap-3">
              {[
                'Agent-first operations',
                'Policy-gated execution',
                'Multi-chain rails',
              ].map((text) => (
                <span key={text} className="rounded-lg border border-border bg-card/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
                  {text}
                </span>
              ))}
            </div>

            <h1 className="font-display text-5xl leading-[1.02] text-foreground sm:text-6xl md:text-7xl lg:text-[6.8rem]">
              Qevor
              <br />
              agent-first payments
              <br />
              with human control.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Give Qevor an outcome. Its agent prepares the payment operation, selects the right chain rail, checks policy and risk, then waits for the required approval before funds move.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/dashboard?tab=agent" className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-elegant hover-scale">
                Command Qevor <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#try" className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-6 py-3 text-sm font-medium backdrop-blur transition-colors hover:border-primary/50">
                Build a test link
              </a>
            </div>
          </div>

          <div className="mt-14 grid max-w-5xl gap-3 sm:grid-cols-3">
            {[
              ['Agent planner', 'Intent to operation', 'reviewable before execution'],
              ['Policy engine', 'Hard safety gates', 'approval required by default'],
              ['Network rails', 'Arc + Mantle', 'more EVM chains next'],
            ].map(([k, v, meta]) => (
              <div key={k} className="rounded-lg border border-border bg-card/70 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{k}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{v}</p>
                <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute right-[-8rem] top-24 hidden w-[44rem] max-w-[48vw] lg:block">
          <div className="rounded-lg border border-border bg-card/70 p-4 shadow-elegant backdrop-blur">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <span className="text-sm font-semibold text-foreground">Multi-chain payout route</span>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Selected network</span>
            </div>
            <div className="space-y-3">
              {[
                ['Qevor wallet', '0x918C...BCA0', 'native balance'],
                ['Safety scan', 'No duplicate address', 'passed'],
                ['Batch payout', '10 recipients', 'tiny test amount'],
                ['Receipt', 'Explorer ready', 'chain id stored'],
              ].map(([label, value, detail], index) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border border-border/80 bg-background/70 p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">{value}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-y border-border/60 bg-card/40 py-4">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-4 whitespace-nowrap px-4 text-sm text-muted-foreground">
              <span className="text-primary">+</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      <section id="product" className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-6">
        <SectionLabel n="01" label="The product" />
        <div className="mb-12 grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <h2 className="font-display text-4xl text-foreground md:text-6xl">
            One agent layer over every Qevor payment rail.
          </h2>
          <p className="text-muted-foreground">
            Users state the outcome first. Qevor plans the operation, applies policy, and routes execution through direct sends, payment links, batches, or agent wallets.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              tag: 'PAYMENT LINKS',
              title: 'Chain-aware checkout',
              body: 'Create shareable links for any enabled Qevor network. The payer sees the requested chain and token before confirming.',
              icon: <Link2 className="h-4 w-4" />,
            },
            {
              tag: 'BATCH PAYOUTS',
              title: 'CSV to one transaction',
              body: 'Import recipients, preview totals, and distribute native assets in one wallet signature on the selected network.',
              icon: <UploadCloud className="h-4 w-4" />,
            },
            {
              tag: 'AGENTIC WALLETS',
              title: 'Policies before autonomy',
              body: 'Agent wallets operate behind limits, allowlists, duplicate detection, human approvals, and audit-friendly receipts.',
              icon: <Bot className="h-4 w-4" />,
            },
          ].map(({ tag, title, body, icon }) => (
            <article key={tag} className="rounded-lg border border-border bg-card p-6">
              <span className="mb-5 inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-primary">
                {icon}
                {tag}
              </span>
              <h3 className="mb-2 text-xl font-semibold text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="safety" className="border-y border-border bg-card/25 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionLabel n="02" label="Fund safety" />
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="font-display text-4xl text-foreground md:text-6xl">Built for grants, demos, and real users later.</h2>
              <p className="mt-5 text-muted-foreground">
                Testnet can move quickly. Mainnet needs stronger gates. The product language now makes that distinction visible instead of hiding risk behind one generic send button.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [<ShieldCheck className="h-5 w-5" />, 'Policy-controlled', 'Qevor never bypasses spending policy. Human approval remains required unless explicitly delegated within strict limits.'],
                [<Layers className="h-5 w-5" />, 'Chain confirmation', 'The app switches and submits on the selected network, reducing wrong-chain sends.'],
                [<AlertTriangle className="h-5 w-5" />, 'Mainnet guardrails', 'Mainnet remains a planned mode with explicit confirmations and stricter limits.'],
                [<Receipt className="h-5 w-5" />, 'Receipts by network', 'Receipts and batch records store chain id and token symbol for traceability.'],
              ].map(([icon, title, body]) => (
                <div key={title as string} className="rounded-lg border border-border bg-background/70 p-5">
                  <span className="mb-4 block text-primary">{icon as React.ReactNode}</span>
                  <h3 className="font-semibold text-foreground">{title as string}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body as string}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="try" ref={tryRef} className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-6">
        <SectionLabel n="03" label="Interactive" />
        <div className="mb-10 grid gap-6 md:grid-cols-2 md:items-end">
          <h2 className="font-display text-4xl text-foreground md:text-6xl">
            Build a multi-chain payment request.
          </h2>
          <p className="text-muted-foreground">
            Try the core Qevor flow without a wallet. Pick a network, create a URL, or resolve a demo handle.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Payment link generator</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_0.72fr]">
              <label className="flex rounded-lg border border-border bg-background focus-within:border-primary/50">
                <span className="flex items-center border-r border-border px-3 font-mono text-sm text-muted-foreground">@</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourhandle"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                />
              </label>
              <select
                value={chainKey}
                onChange={(e) => setChainKey(e.target.value as QevorChainKey)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                {qevorChains.map((network) => (
                  <option key={network.key} value={network.key}>
                    {network.label} ({network.paymentAsset})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-[0.8fr_1fr]">
              <label className="flex rounded-lg border border-border bg-background focus-within:border-primary/50">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Amount"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                />
                <span className="flex items-center border-l border-border px-3 text-xs font-medium text-muted-foreground">
                  {selectedNetwork.paymentAsset}
                </span>
              </label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Memo optional"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="min-h-[72px] rounded-lg border border-dashed border-border bg-background p-3">
              {payLink ? (
                <code className="break-all font-mono text-xs text-primary">{payLink}</code>
              ) : (
                <span className="text-xs text-muted-foreground">Your chain-aware link will appear here.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={copyLink}
                disabled={!payLink}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {payLink && (
                <a href={payLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-primary/50">
                  Open <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Username to wallet lookup</h3>
            <form onSubmit={doResolve} className="flex gap-3">
              <label className="flex min-w-0 flex-1 rounded-lg border border-border bg-background focus-within:border-primary/50">
                <span className="flex items-center border-r border-border px-3 font-mono text-sm text-muted-foreground">@</span>
                <input
                  value={resolveHandle}
                  onChange={(e) => setResolveHandle(e.target.value)}
                  placeholder="aria, bola, satoshi"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                />
              </label>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
                <Search className="h-4 w-4" />
                Resolve
              </button>
            </form>
            {resolveError && <p className="text-sm text-destructive">{resolveError}</p>}
            {resolved && (
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-sm">@{resolved.handle}</span>
                  <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">Verified</span>
                </div>
                <code className="block break-all rounded-md border border-border bg-secondary/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                  {resolved.address}
                </code>
                <button onClick={useInLink} className="mt-3 text-xs text-primary underline underline-offset-4">
                  Use in payment link
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="networks" className="border-y border-border bg-card/25 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <SectionLabel n="04" label="Networks" />
          <h2 className="mb-10 max-w-3xl font-display text-4xl text-foreground md:text-6xl">
            Qevor is a payment workspace across settlement layers.
          </h2>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
            {[
              ['Testnet rails', 'Live now', 'Arc and Mantle are enabled for safe demos, grant proof, and hackathon testing.'],
              ['Network registry', 'Expandable', 'Every payment stores chain id, token symbol, RPC, and explorer metadata.'],
              ['Mainnet rails', 'Planned', 'Locked until safety confirmations, limits, and stronger previews are complete.'],
            ].map(([name, status, body]) => (
              <div key={name} className="bg-card p-6">
                <p className="text-xl font-semibold text-foreground">{name}</p>
                <p className="mt-2 text-sm font-medium text-primary">{status}</p>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background py-20 text-center">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <Sparkles className="mx-auto mb-6 h-6 w-6 text-primary" />
          <blockquote className="font-display text-3xl italic leading-tight text-foreground md:text-5xl">
            "Payments should be fast enough for consumers and careful enough for teams."
          </blockquote>
        </div>
      </section>

      <section id="start" className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionLabel n="05" label="Start" />
            <h2 className="font-display text-4xl text-foreground md:text-6xl">Give Qevor a payment objective.</h2>
            <p className="mt-5 text-muted-foreground">
              The agent plans the operation and recommends a payment rail. Review policy, approval requirements, and recipients before execution.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link to="/dashboard?tab=agent" className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/50">
              <Bot className="mb-5 h-5 w-5 text-primary" />
              <p className="text-xl font-semibold text-foreground">Command Qevor</p>
              <p className="mt-2 text-sm text-muted-foreground">Describe an outcome and review the agent's operation plan.</p>
            </Link>
            <a href="https://github.com/Qevor/Qevor" target="_blank" rel="noreferrer" className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/50">
              <Github className="mb-5 h-5 w-5 text-primary" />
              <p className="text-xl font-semibold text-foreground">Build with Qevor</p>
              <p className="mt-2 text-sm text-muted-foreground">Open-source payment rails for hackathons and grants.</p>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 sm:px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Qevor" className="h-6 w-6 rounded object-cover" />
            <span className="text-sm font-semibold">Qevor</span>
            <span className="text-xs text-muted-foreground">Agent-first payment infrastructure</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground">
            {[
              ['#product', 'Product'],
              ['#safety', 'Safety'],
              ['#networks', 'Networks'],
              ['/dashboard?tab=agent', 'Agent Workspace'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
            <a href="https://x.com/Qevorpay" target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-foreground">
              <Twitter className="h-4 w-4" /> X
            </a>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Qevor Labs</p>
        </div>
      </footer>
    </div>
  );
}
