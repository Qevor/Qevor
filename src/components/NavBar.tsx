import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, User } from 'lucide-react';
import { useProfiles, Profile } from '@/hooks/useProfiles';
import { ThemeToggle } from '@/components/ThemeToggle';
import { toast } from 'sonner';

export default function NavBar() {
    const { address, isConnected } = useAccount();
    const { setShowAuthFlow, handleLogOut, user } = useDynamicContext();
    const { getProfileByWallet, registerUsername, loading: profileLoading } = useProfiles();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');

    const truncateAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    useEffect(() => {
        if (address) {
            getProfileByWallet(address).then(p => setProfile(p));
        } else {
            setProfile(null);
        }
    }, [address]);

    const handleClaimUsername = async () => {
        if (!newUsername || newUsername.includes(' ')) return toast.error('Invalid username');
        const p = await registerUsername(address!, newUsername);
        if (p) {
            setProfile(p);
            setNewUsername('');
        }
    };

    return (
        <nav className="w-full border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 group">
                    <img src="/logo.png" alt="Qevor Logo" className="w-12 h-12 qevor-logo-pulse object-contain" />
                    <span className="text-xl font-bold gradient-text pb-1">Qevor</span>
                </Link>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                        <Link to="/dashboard?tab=agent" className="text-primary hover:text-primary/80 transition-colors">Agent Workspace</Link>
                        <Link to="/agents" className="text-muted-foreground hover:text-primary transition-colors">Agent Operations</Link>
                        <Link to="/dashboard?tab=wallet" className="text-muted-foreground hover:text-primary transition-colors">Payment Rails</Link>
                    </div>
                    <ThemeToggle />
                    {isConnected && address ? (
                        <>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="font-mono text-sm border-primary/30 hover:border-primary/60">
                                        {truncateAddr(address)}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem asChild className="md:hidden">
                                        <Link to="/dashboard?tab=agent">Agent Workspace</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="md:hidden">
                                        <Link to="/agents">Agent Operations</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="md:hidden">
                                        <Link to="/dashboard?tab=wallet">Payment Rails</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="md:hidden">
                                        <Link to="/send">Direct Send</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="md:hidden" />
                                    <DropdownMenuItem
                                        onClick={() => setProfileOpen(true)}
                                        className="gap-2 cursor-pointer"
                                    >
                                        <User size={14} />
                                        Profile
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => handleLogOut()}
                                        className="text-destructive focus:text-destructive cursor-pointer"
                                    >
                                        Disconnect Wallet
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Profile Dialog */}
                            <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                                <DialogContent className="sm:max-w-md bg-card border-border">
                                    <DialogHeader>
                                        <DialogTitle>Your Profile</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-2">
                                        {/* User info summary */}
                                        <div className="space-y-3 p-4 bg-secondary/50 rounded-xl border border-border">
                                            {(user as any)?.email && (
                                                <div className="flex justify-between items-center gap-4">
                                                    <span className="text-sm text-muted-foreground shrink-0">Email</span>
                                                    <span className="text-sm font-medium truncate">{(user as any).email}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center gap-4">
                                                <span className="text-sm text-muted-foreground shrink-0">Username</span>
                                                <span className="text-sm font-mono font-medium">
                                                    {profile?.username
                                                        ? `@${profile.username}`
                                                        : <span className="text-muted-foreground italic text-xs">Not set</span>
                                                    }
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-start gap-4">
                                                <span className="text-sm text-muted-foreground shrink-0">Wallet</span>
                                                <span className="text-xs font-mono text-right truncate max-w-[200px]">{address}</span>
                                            </div>
                                        </div>

                                        {/* Claim username section (only shown if not yet claimed) */}
                                        {!profile?.username && (
                                            <div className="space-y-3 pt-1">
                                                <p className="text-sm text-muted-foreground">
                                                    Claim a username so others can send you funds without your long wallet address.
                                                </p>
                                                <input
                                                    value={newUsername}
                                                    onChange={e => setNewUsername(e.target.value)}
                                                    placeholder="@satoshinakamoto"
                                                    className="w-full bg-secondary border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                                                />
                                                <Button
                                                    className="w-full h-12 gradient-primary shadow-glow"
                                                    onClick={handleClaimUsername}
                                                    disabled={profileLoading}
                                                >
                                                    {profileLoading && <Loader2 className="animate-spin mr-2 w-4 h-4" />}
                                                    Claim Username
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </>
                    ) : (
                        <Button onClick={() => setShowAuthFlow(true)} className="gradient-primary shadow-glow hover:shadow-glow-lg transition-shadow">
                            Login
                        </Button>
                    )}
                </div>
            </div>
        </nav>
    );
}
