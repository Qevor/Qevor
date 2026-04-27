import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Users, ArrowRight, Zap, ShieldCheck } from 'lucide-react'

export default function SendPage() {
    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg space-y-8 text-center">
                <div className="space-y-3">
                    <div className="inline-flex items-center justify-center p-4 rounded-full bg-primary/10 border border-primary/20 mb-2">
                        <Users className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="text-4xl font-bold gradient-text">Batch Send</h1>
                    <p className="text-muted-foreground text-lg">
                        Pay multiple recipients in one go. Perfect for payroll, rewards, and group splits.
                    </p>
                </div>

                <div className="glass-card rounded-xl p-6 space-y-4 text-left">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                            <Zap className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">Send to multiple wallets at once</p>
                            <p className="text-muted-foreground text-xs mt-0.5">Add as many recipients as you need, each with their own amount.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">Username or wallet address</p>
                            <p className="text-muted-foreground text-xs mt-0.5">Use Qevor usernames or paste raw 0x addresses — both work.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <Button asChild size="lg" className="w-full gradient-primary shadow-glow hover:shadow-glow-lg h-14 text-base font-semibold">
                        <Link to="/dashboard?tab=batch" className="flex items-center gap-2">
                            Create a Batch Payment
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Want to receive instead?{' '}
                        <Link to="/create" className="text-primary hover:underline">Generate a payment link</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
