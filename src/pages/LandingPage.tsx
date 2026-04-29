import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, Link as LinkIcon, Split, LayoutList } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
            {/* Hero Section */}
            <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center relative overflow-hidden">
                {/* Background glow effects */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] -z-10 pointer-events-none" />

                <div className="mb-8">
                    <img src="/logo.png" alt="Qevor Logo" className="w-56 h-56 qevor-logo-pulse object-contain drop-shadow-[0_0_24px_rgba(0,180,255,0.5)]" />
                </div>

                <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mb-10 text-balance">
                    The decentralized payment layer for Arc. Create versatile payment links and send batch payments seamlessly.
                </p>

                <div className="flex flex-col sm:flex-row gap-6 items-center justify-center w-full max-w-lg">
                    <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                        <Button asChild size="lg" className="w-full sm:w-auto gradient-primary shadow-glow hover:shadow-glow-lg transition-all text-lg font-medium px-8 h-14">
                            <Link to="/create">Receive USDC</Link>
                        </Button>
                        <p className="text-xs text-muted-foreground">Generate a payment link to receive funds</p>
                    </div>
                    <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto text-lg font-medium px-8 h-14 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all text-primary">
                            <Link to="/send">Send USDC</Link>
                        </Button>
                        <p className="text-xs text-muted-foreground">Batch payout to multiple wallets</p>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-20 px-4 border-t border-border/50 bg-secondary/30 relative z-10">
                <div className="container mx-auto">
                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="glass-card p-6 md:p-8 rounded-2xl flex flex-col items-start group hover:border-primary/50 transition-colors">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary mb-5 group-hover:scale-110 transition-transform">
                                <LinkIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">Payment Links</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                Generate simple, decentralized URLs to receive USDC payments on the Arc Testnet. Perfect for quick requests.
                            </p>
                        </div>

                        <div className="glass-card p-6 md:p-8 rounded-2xl flex flex-col items-start group hover:border-primary/50 transition-colors">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary mb-5 group-hover:scale-110 transition-transform">
                                <Split className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">Split Payments</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                Create a batch of unique payment links for multiple recipients in one click. Great for ticketing and limited sales.
                            </p>
                        </div>

                        <div className="glass-card p-6 md:p-8 rounded-2xl flex flex-col items-start group hover:border-primary/50 transition-colors">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary mb-5 group-hover:scale-110 transition-transform">
                                <LayoutList className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">Batch Payments</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                Send payments to multiple wallets simultaneously. Track progress and manage group payouts with ease.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-8 text-center border-t border-border">
                <p className="text-muted-foreground font-medium text-sm flex items-center justify-center gap-2">
                    Powered by <img src="/logo.png" alt="Qevor Logo" className="w-6 h-6 mx-1 object-contain" /> <span className="text-foreground">Arc Testnet</span>
                </p>
            </footer>
        </div>
    );
}
