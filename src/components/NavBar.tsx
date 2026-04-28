import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function NavBar() {
    const { address, isConnected } = useAccount();
    const { setShowAuthFlow, handleLogOut } = useDynamicContext();

    const truncateAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
        <nav className="w-full border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 group">
                    <img src="/logo.png" alt="Qevor Logo" className="w-12 h-12 qevor-logo-pulse object-contain" />
                    <span className="text-xl font-bold gradient-text pb-1">Qevor</span>
                </Link>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                        <Link to="/create" className="text-muted-foreground hover:text-primary transition-colors">Create</Link>
                        <Link to="/send" className="text-muted-foreground hover:text-primary transition-colors">Send</Link>
                        <Link to="/dashboard" className="text-muted-foreground hover:text-primary transition-colors">Dashboard</Link>
                    </div>
                    {isConnected && address ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="font-mono text-sm border-primary/30 hover:border-primary/60">
                                    {truncateAddr(address)}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem asChild className="md:hidden">
                                    <Link to="/create">Create</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="md:hidden">
                                    <Link to="/send">Send</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="md:hidden">
                                    <Link to="/dashboard">Dashboard</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleLogOut()} className="text-destructive focus:text-destructive">
                                    Disconnect Wallet
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
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
