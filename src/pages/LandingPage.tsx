import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Link2, Users, Wallet, ShieldCheck, Sparkles,
  Receipt, Github, Copy, Check, Search, LayoutDashboard, Twitter
} from 'lucide-react';

/* ── helpers ──────────────────────────────────── */
const SectionLabel = ({ n, label }: { n: string; label: string }) => (
  <div className="flex items-center gap-3 mb-6">
    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{n}</span>
    <span className="h-px w-10 bg-border inline-block" />
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
  '@aria → @bola · 250 USDC',
  'Batch payout · 42 recipients · 18,400 USDC',
  'Receipt #QV-8842 sealed',
  '@dao-treasury funded · 5,000 USDC',
  'Block 1,204,331 confirmed · 240 ms',
  '@satoshi → @aria · 1,000 USDC',
  'Payment link QV-7721 claimed',
  'Split payout · 12 wallets · 3,600 USDC',
];

/* ── main component ───────────────────────────── */
export default function LandingPage() {
  /* TryItLive state */
  const [handle, setHandle] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [copied, setCopied] = useState(false);
  const [resolveHandle, setResolveHandle] = useState('');
  const [resolved, setResolved] = useState<{ handle: string; address: string } | null>(null);
  const [resolveError, setResolveError] = useState('');
  const tryRef = useRef<HTMLDivElement>(null);

  const payLink = handle
    ? `https://qevor.vercel.app/pay?to=${handle}&amount=${amount || '0'}&token=USDC${memo ? `&memo=${encodeURIComponent(memo)}` : ''}`
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
    } else {
      setResolved(null);
      setResolveError('Handle not found');
    }
  };

  const useInLink = () => {
    if (resolved) {
      setHandle(resolved.handle);
      tryRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── 1. HEADER ───────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Qevor" className="w-8 h-8 rounded-md object-cover qevor-logo-pulse" />
            <span className="font-display text-lg font-medium text-foreground">Qevor</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            {[['#product','Product'],['#how','How it works'],['#try','Try it'],['#network','Network'],['#start','Get started']].map(([h,l])=>(
              <a key={h} href={h} className="hover:text-foreground transition-colors">{l}</a>
            ))}
          </nav>
          <Link
            to="/dashboard"
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground shadow-elegant hover-scale"
          >
            <LayoutDashboard className="h-4 w-4" />
            Go to dashboard
          </Link>
        </div>
      </header>

      {/* ── 2. HERO ─────────────────────────────── */}
      <section className="relative overflow-hidden grid-bg py-28 md:py-36">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--gradient-glow)' }} />
        <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
          {/* text side */}
          <div>
            {/* eyebrow */}
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              {['Arc Testnet','Production preview','v1.0'].map((t, i) => (
                <span key={t} className="flex items-center gap-3">
                  {i > 0 && <span className="h-px w-10 bg-border" />}
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t}</span>
                </span>
              ))}
            </div>
            <h1 className="font-display text-5xl md:text-7xl lg:text-[7rem] leading-[1.02] mb-6">
              <span className="text-foreground">The payment hub</span>
              <br />
              <span className="italic text-muted-foreground">for the Arc economy.</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mb-10 leading-relaxed">
              Send, request, and batch-pay USDC on the Arc Testnet. One app for wallets, payment links, and mass payouts — all on-chain.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/dashboard" className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium bg-primary text-primary-foreground shadow-elegant hover-scale">
                Go to dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#try" className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium border border-border hover:border-primary/40 transition-colors">
                Try it live
              </a>
              <a href="#how" className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium border border-border hover:border-primary/40 transition-colors">
                See how it works
              </a>
            </div>
          </div>

          {/* visual card */}
          <div className="rounded-3xl border border-border bg-card shadow-elegant overflow-hidden relative">
            <div className="w-full h-[420px] relative" style={{background:'radial-gradient(ellipse at 30% 30%, hsl(191 100% 30% / 0.7), transparent 50%), radial-gradient(ellipse at 70% 60%, hsl(191 100% 20% / 0.6), transparent 50%), radial-gradient(ellipse at 50% 80%, hsl(191 100% 15% / 0.5), transparent 40%), hsl(223 84% 5%)'}}>
              {/* Floating payment visualizations */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-full max-w-md">
                  {/* Central hub */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-primary/40 bg-primary/10 flex items-center justify-center shadow-glow">
                    <img src="/logo.png" alt="Q" className="w-10 h-10 object-contain" />
                  </div>
                  {/* Orbiting dots */}
                  {[
                    { top: '15%', left: '20%', delay: '0s', label: '@aria' },
                    { top: '25%', right: '15%', delay: '0.3s', label: '250 USDC' },
                    { top: '70%', left: '10%', delay: '0.6s', label: '@bola' },
                    { top: '75%', right: '20%', delay: '0.9s', label: 'Batch #42' },
                  ].map((dot, i) => (
                    <div key={i} className="absolute" style={{ top: dot.top, left: dot.left, right: (dot as any).right }}>
                      <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-card/60 backdrop-blur-sm px-3 py-1.5 animate-pulse-dot" style={{ animationDelay: dot.delay }}>
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="font-mono text-xs text-primary/80">{dot.label}</span>
                      </div>
                    </div>
                  ))}
                  {/* Connection lines (CSS) */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-dashed border-primary/10" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full border border-dashed border-primary/5" />
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 p-4 bg-card/80 backdrop-blur-md border-t border-border/60">
              <span className="animate-pulse-dot h-2 w-2 rounded-full bg-primary flex-shrink-0" />
              <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-mono text-primary">LIVE · ARC</span>
              <code className="font-mono text-xs text-muted-foreground flex-1 truncate">$ pay @aria 250 USDC --memo "design sprint"</code>
              <span className="text-xs font-mono text-muted-foreground whitespace-nowrap hidden sm:block">Block 1,204,331 · 240 ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. MARQUEE ──────────────────────────── */}
      <div className="border-y border-border/60 bg-card/40 py-4 overflow-hidden">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-4 px-4 text-sm text-muted-foreground whitespace-nowrap">
              <span className="text-primary">◆</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── 4. PRODUCT ──────────────────────────── */}
      <section id="product" className="py-28 mx-auto max-w-7xl px-6 w-full">
        <SectionLabel n="01" label="The product" />
        <h2 className="font-display text-4xl md:text-6xl mb-16">
          <span className="text-foreground">A dashboard, a checkout,</span>
          <br />
          <span className="italic text-muted-foreground">and a treasury — in one app.</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
            num: '01', tag: 'QEVOR ID', title: 'Username System',
            body: 'Claim a unique @handle tied to your wallet. Share it instead of a 42-character address — safer, faster, human-readable.',
            icon: <Users className="h-4 w-4" />,
            visual: <div className="w-full h-full flex items-center justify-center" style={{background:'radial-gradient(ellipse at 30% 50%, hsl(191 100% 20% / 0.6), transparent 70%), radial-gradient(ellipse at 70% 20%, hsl(191 100% 15% / 0.5), transparent 60%), hsl(222 47% 11%)'}}>
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-full border-2 border-primary/60 flex items-center justify-center mx-auto bg-primary/10 shadow-glow">
                  <span className="font-mono text-xl text-primary font-bold">@</span>
                </div>
                <div className="font-mono text-xs text-primary/80 bg-card/60 rounded-full px-3 py-1 border border-primary/20">aria.qevor</div>
              </div>
            </div>
          },
          {
            num: '02', tag: 'PAYMENT LINKS', title: 'Signed URLs',
            body: 'Generate shareable payment links that specify amount and receiver. Anyone can pay you in seconds from any wallet.',
            icon: <Link2 className="h-4 w-4" />,
            visual: <div className="w-full h-full flex items-center justify-center" style={{background:'radial-gradient(ellipse at 60% 40%, hsl(191 100% 25% / 0.6), transparent 70%), radial-gradient(ellipse at 20% 70%, hsl(191 100% 15% / 0.5), transparent 60%), hsl(222 47% 11%)'}}>
              <div className="space-y-2 w-full px-6">
                <div className="rounded-xl border border-primary/30 bg-card/60 px-3 py-2 font-mono text-xs text-primary/80 truncate">
                  qevor.vercel.app/pay?to=@aria&amount=250
                </div>
                <div className="flex gap-2 justify-end">
                  <div className="rounded-full bg-primary/20 border border-primary/30 px-3 py-1 text-xs text-primary font-mono">Copy ↗</div>
                </div>
              </div>
            </div>
          },
          {
            num: '03', tag: 'BATCH PAYOUTS', title: 'CSV → 1 Transaction',
            body: 'Paste a CSV of addresses and amounts. Qevor fans them into a single on-chain batch — gas-efficient mass distribution.',
            icon: <Receipt className="h-4 w-4" />,
            visual: <div className="w-full h-full flex items-center justify-center" style={{background:'radial-gradient(ellipse at 50% 30%, hsl(191 100% 20% / 0.6), transparent 70%), radial-gradient(ellipse at 80% 70%, hsl(191 100% 15% / 0.5), transparent 60%), hsl(222 47% 11%)'}}>
              <div className="space-y-1.5 px-6 w-full">
                {['@aria · 250','@bola · 180','@dao · 5,000','@satoshi · 1,000'].map((r,i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" style={{animationDelay:`${i*0.2}s`}} />
                    <span className="font-mono text-xs text-muted-foreground">{r} USDC</span>
                  </div>
                ))}
              </div>
            </div>
          },
          ].map(({ num, tag, title, body, icon, visual }) => (
            <div key={num} className="group rounded-3xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors duration-300">
              <div className="aspect-[4/3] overflow-hidden">
                {visual}
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-xs text-muted-foreground">{num}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-mono text-primary flex items-center gap-1">
                    {icon}{tag}
                  </span>
                </div>
                <h3 className="font-display text-xl mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. TRY IT LIVE ──────────────────────── */}
      <section id="try" ref={tryRef} className="border-t border-border bg-card/30 py-28">
        <div className="mx-auto max-w-7xl px-6">
          <SectionLabel n="02" label="Interactive" />
          <div className="grid md:grid-cols-2 gap-8 mb-12 items-end">
            <h2 className="font-display text-4xl md:text-6xl">
              <span className="text-foreground">Generate a link.</span>
              <br />
              <span className="italic text-muted-foreground">Resolve a handle.</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Try the core Qevor interactions right here — no wallet needed. Build a payment URL or look up any registered @handle.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Payment link generator */}
            <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-display text-lg">Payment link generator</h3>
              <div className="flex rounded-xl border border-border overflow-hidden focus-within:border-primary/40 transition-colors">
                <span className="px-3 flex items-center text-muted-foreground bg-secondary/50 text-sm font-mono border-r border-border">@</span>
                <input
                  value={handle}
                  onChange={e => setHandle(e.target.value)}
                  placeholder="yourhandle"
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex rounded-xl border border-border overflow-hidden focus-within:border-primary/40 transition-colors">
                  <input
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Amount"
                    className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                  />
                  <span className="px-3 flex items-center text-xs text-muted-foreground bg-secondary/50 border-l border-border font-mono">USDC</span>
                </div>
                <input
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  placeholder="Memo (optional)"
                  className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors"
                />
              </div>
              <div className="rounded-xl border border-dashed border-border p-3 bg-background min-h-[60px]">
                {payLink
                  ? <code className="text-xs text-primary break-all font-mono">{payLink}</code>
                  : <span className="text-xs text-muted-foreground">Your link will appear here…</span>
                }
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyLink}
                  disabled={!payLink}
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground shadow-glow hover-scale disabled:opacity-40"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                {payLink && (
                  <a href={payLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm border border-border hover:border-primary/40 transition-colors">
                    Open <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Username resolver */}
            <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-display text-lg">Username → wallet lookup</h3>
              <form onSubmit={doResolve} className="flex gap-3">
                <div className="flex rounded-xl border border-border overflow-hidden focus-within:border-primary/40 transition-colors flex-1">
                  <span className="px-3 flex items-center text-muted-foreground bg-secondary/50 text-sm font-mono border-r border-border">@</span>
                  <input
                    value={resolveHandle}
                    onChange={e => setResolveHandle(e.target.value)}
                    placeholder="aria, bola, satoshi…"
                    className="flex-1 bg-transparent px-3 py-2 text-sm outline-none font-mono"
                  />
                </div>
                <button type="submit" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-foreground text-background hover-scale">
                  <Search className="h-4 w-4" />Resolve
                </button>
              </form>
              {resolveError && <p className="text-sm text-destructive">{resolveError}</p>}
              {resolved && (
                <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">@{resolved.handle}</span>
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">Verified</span>
                  </div>
                  <div className="rounded-lg bg-secondary/50 border border-border px-3 py-2">
                    <code className="font-mono text-xs text-muted-foreground break-all">{resolved.address}</code>
                  </div>
                  <button
                    onClick={useInLink}
                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    Use in payment link →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. HOW IT WORKS ─────────────────────── */}
      <section id="how" className="py-28 mx-auto max-w-7xl px-6 w-full">
        <div className="grid md:grid-cols-2 gap-8 mb-16 items-end">
          <h2 className="font-display text-4xl md:text-6xl">
            <span className="text-foreground">Wallet in.</span>
            <br />
            <span className="italic text-muted-foreground">Receipt out.</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed">Five steps from cold start to confirmed on-chain payment — no bridges, no wrapping, no waiting.</p>
        </div>
        <ol className="divide-y border-y border-border">
          {[
            ['01','Connect wallet','Link any EVM wallet via Dynamic Labs in one click. No seed phrase entry.'],
            ['02','Claim @handle','Register a unique username so anyone can send you funds by name.'],
            ['03','Send, request, or batch','Create a payment link, send directly, or upload a CSV for mass payout.'],
            ['04','Confirm on-chain','Review the transaction and approve in your wallet. One signature.'],
            ['05','Track everything','Every receipt is sealed immutably in Supabase and visible in your dashboard.'],
          ].map(([n, title, desc]) => (
            <li key={n} className="grid grid-cols-12 gap-4 py-6 items-start">
              <span className="col-span-1 font-mono text-xs text-muted-foreground pt-1">{n}</span>
              <h3 className="col-span-3 font-display text-lg text-foreground">{title}</h3>
              <p className="col-span-8 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 7. NETWORK ──────────────────────────── */}
      <section id="network" className="border-t border-border py-28 bg-card/20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionLabel n="03" label="Powered by" />
          {/* partner grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-3xl overflow-hidden mb-10">
            {[
              ['Arc Network','Settlement layer'],
              ['Native USDC','18-decimal stable coin'],
              ['Dynamic Labs','Web3 authentication'],
              ['Supabase','Receipts & profiles'],
            ].map(([name, role]) => (
              <div key={name} className="bg-card p-8">
                <p className="font-display text-lg mb-1">{name}</p>
                <p className="text-xs text-muted-foreground">{role}</p>
              </div>
            ))}
          </div>
          {/* trust cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {[
              [<ShieldCheck className="h-5 w-5" />,'Self-custodial','Your keys, your funds. Qevor never holds your assets.'],
              [<Wallet className="h-5 w-5" />,'Native USDC','Stable value payments, no volatile gas tokens.'],
              [<Receipt className="h-5 w-5" />,'Immutable receipts','Every transaction recorded and sealed on-chain.'],
            ].map(([icon, title, body], i) => (
              <div key={i} className="rounded-3xl border border-border bg-card p-6 flex gap-4">
                <span className="text-primary mt-1 flex-shrink-0">{icon as React.ReactNode}</span>
                <div>
                  <h3 className="font-display text-base mb-1">{title as string}</h3>
                  <p className="text-sm text-muted-foreground">{body as string}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. QUOTE ────────────────────────────── */}
      <section className="border-y border-border bg-card/30 py-24 text-center">
        <div className="mx-auto max-w-3xl px-6">
          <Sparkles className="h-6 w-6 text-primary mx-auto mb-6" />
          <blockquote className="font-display italic text-3xl md:text-5xl text-foreground leading-tight mb-6">
            "Crypto payments should feel like sending a message — instant, certain, and human."
          </blockquote>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">— The Qevor Team</p>
        </div>
      </section>

      {/* ── 9. GET STARTED ──────────────────────── */}
      <section id="start" className="py-28 mx-auto max-w-7xl px-6 w-full">
        <h2 className="font-display text-4xl md:text-6xl mb-12">
          <span className="text-foreground">One minute.</span>
          <br />
          <span className="italic text-muted-foreground">Two steps.</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Quick start */}
          <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quick start</p>
            <pre className="rounded-xl border border-border bg-background p-4 font-mono text-xs text-primary overflow-x-auto">
{`npm i -g @qevor/cli
qevor connect --network arc-testnet`}
            </pre>
          </div>
          {/* .env */}
          <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">.env example</p>
            <pre className="rounded-xl border border-border bg-background p-4 font-mono text-xs text-muted-foreground overflow-x-auto">
{`ARC_RPC_URL=https://rpc.testnet.arc.network
QEVOR_USERNAME=yourhandle
USDC_TOKEN=0xNative`}
            </pre>
            <div className="flex gap-2 flex-wrap">
              {['⚡ Native USDC','🔐 Self-custodial','🟢 Public RPC'].map(b => (
                <span key={b} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* CTA blocks */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-border bg-gradient-to-br from-card to-background p-8 flex flex-col gap-4">
            <p className="font-display text-2xl">Ready to pay on Arc?</p>
            <p className="text-sm text-muted-foreground">Open the app and connect your wallet in seconds.</p>
            <Link to="/dashboard" className="self-start rounded-full px-6 py-2.5 text-sm font-medium bg-foreground text-background hover-scale">
              Open Qevor
            </Link>
          </div>
          <div className="rounded-3xl p-8 flex flex-col gap-4" style={{ background: 'var(--gradient-brand)' }}>
            <p className="font-display text-2xl text-primary-foreground">Building on Arc?</p>
            <p className="text-sm text-primary-foreground/80">Qevor is open-source. Fork it, extend it, or contribute.</p>
            <div className="flex gap-4">
              <a href="https://github.com/Qevor/Qevor" target="_blank" rel="noreferrer" className="self-start flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium bg-primary-foreground text-background hover-scale">
                <Github className="h-4 w-4" />View on GitHub
              </a>
              <a href="https://x.com/Qevorpay" target="_blank" rel="noreferrer" className="self-start flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium border border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 hover-scale transition-colors">
                <Twitter className="h-4 w-4" />Follow updates
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 10. FOOTER ──────────────────────────── */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Qevor" className="w-6 h-6 rounded object-cover" />
            <span className="font-display text-sm">Qevor</span>
            <span className="text-muted-foreground text-xs">· Payment hub for Arc</span>
          </div>
          <nav className="flex gap-6 text-sm text-muted-foreground items-center">
            {[['#product','Product'],['#how','How it works'],['#network','Network'],['https://qevor.vercel.app/dashboard','App']].map(([h,l])=>(
              <a key={h} href={h} className="hover:text-foreground transition-colors">{l}</a>
            ))}
            <a href="https://x.com/Qevorpay" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors ml-4 border-l border-border/60 pl-6 flex items-center gap-2">
              <Twitter className="h-4 w-4" /> X
            </a>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Qevor Labs</p>
        </div>
      </footer>

    </div>
  );
}
