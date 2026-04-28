import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { createPublicClient, http, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Send, Download, Loader2, ArrowUpRight, ArrowDownLeft, Users, Link as LinkIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';
import { useProfiles } from '@/hooks/useProfiles';
import { useArcSend } from '@/hooks/useArcSend';
import { Link, useNavigate } from 'react-router-dom';

// Direct Arc RPC client — bypasses wagmi chain config to avoid chainId mismatch
const arcClient = createPublicClient({
    transport: http('https://rpc.testnet.arc.network'),
});

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

// Minimal ERC-20 ABI for balanceOf
const erc20Abi = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

export function WalletTab() {
    const { address } = useAccount();
    const [displayBalance, setDisplayBalance] = useState('0.0000');

    const fetchBalance = useCallback(async () => {
        if (!address) return;
        try {
            // Fetch native USDC balance (USDC is the native gas token on Arc)
            const native = await arcClient.getBalance({ address });
            if (native > 0n) {
                setDisplayBalance(parseFloat(formatUnits(native, 18)).toFixed(4));
                return;
            }
            // Fallback: check ERC-20 USDC contract
            const erc20 = await arcClient.readContract({
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [address],
            });
            setDisplayBalance(parseFloat(formatUnits(erc20, 18)).toFixed(4));
        } catch {
            // silently keep last known value
        }
    }, [address]);

    useEffect(() => {
        fetchBalance();
        const id = setInterval(fetchBalance, 5000);
        return () => clearInterval(id);
    }, [fetchBalance]);

    const refetch = () => {
        setTimeout(fetchBalance, 1000);
        setTimeout(fetchBalance, 4000);
        setTimeout(fetchBalance, 10000);
    };
    const navigate = useNavigate();

    const [sendOpen, setSendOpen] = useState(false);
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');

    const { sendTransaction, isPending } = useArcSend();

    const { resolveUsernameToWallet } = useProfiles();

    const handleSend = async () => {
        let finalRecipient = recipient;

        if (!recipient.startsWith('0x') || recipient.length !== 42) {
            toast.loading('Resolving username...');
            const resolved = await resolveUsernameToWallet(recipient);
            toast.dismiss();

            if (!resolved) {
                return toast.error('Invalid address or unknown username');
            }
            finalRecipient = resolved;
            toast.success(`Resolved to ${resolved.slice(0, 6)}...${resolved.slice(-4)}`);
        }

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return toast.error('Invalid amount');
        }

        sendTransaction({
            to: finalRecipient,
            amount,
            onSuccess(hash) {
                toast.success('Transaction sent!', { description: hash ? `Hash: ${hash.slice(0, 10)}...` : '' });
                setSendOpen(false);
                setRecipient('');
                setAmount('');
                refetch();
            },
            onError(error) {
                toast.error('Transaction failed', { description: error.message });
            },
        });
    };

    return (
        <div className="space-y-8">
            <div className="glass-card p-10 rounded-3xl flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />

                <h2 className="text-muted-foreground font-medium mb-2 uppercase tracking-widest text-sm">Available Balance</h2>
                <div className="text-5xl md:text-6xl font-extrabold gradient-text mb-2">
                    {displayBalance}
                </div>
                <p className="text-primary/80 font-medium mb-10">USDC (Arc Testnet)</p>

                {/* Primary action buttons — Send & Receive */}
                <div className="flex gap-4 w-full max-w-sm">
                    {/* Send Dialog */}
                    <Dialog open={sendOpen} onOpenChange={setSendOpen}>
                        <DialogTrigger asChild>
                            <Button size="lg" className="flex-1 gradient-primary shadow-glow hover:shadow-glow-lg transition-all h-14 rounded-2xl text-lg">
                                <Send className="mr-2 w-5 h-5" /> Send
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md bg-card border-border">
                            <DialogHeader>
                                <DialogTitle>Send USDC</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Recipient Address</label>
                                    <input
                                        value={recipient}
                                        onChange={(e) => setRecipient(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full bg-secondary border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Amount (USDC)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full bg-secondary border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary pl-10"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                                    </div>
                                </div>
                                <Button
                                    className="w-full h-12 mt-4 gradient-primary shadow-glow"
                                    onClick={handleSend}
                                    disabled={isPending}
                                >
                                    {isPending ? <Loader2 className="animate-spin mr-2" /> : <ArrowUpRight className="mr-2" />}
                                    {isPending ? 'Sending...' : 'Confirm Transfer'}
                                </Button>
                                <div className="pt-2 text-center border-t border-border mt-4">
                                    <button
                                        type="button"
                                        onClick={() => { setSendOpen(false); navigate('/dashboard?tab=batch'); }}
                                        className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                                    >
                                        Need to send to multiple people? <span className="underline">Create a Batch Request</span>
                                    </button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Receive Dialog */}
                    <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
                        <DialogTrigger asChild>
                            <Button size="lg" variant="outline" className="flex-1 border-primary/30 hover:border-primary/60 text-primary hover:bg-primary/5 transition-all h-14 rounded-2xl text-lg">
                                <Download className="mr-2 w-5 h-5" /> Receive
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md bg-card border-border flex flex-col items-center p-8">
                            <DialogHeader className="mb-4 w-full text-center">
                                <DialogTitle className="text-center text-xl">Receive USDC</DialogTitle>
                                <p className="text-muted-foreground text-sm">Scan to send funds on Arc Testnet</p>
                            </DialogHeader>
                            <div className="bg-white p-4 rounded-3xl mb-6 shadow-glow">
                                <QRCode value={address || '0x'} size={200} />
                            </div>
                            <div className="w-full bg-secondary p-3 rounded-xl flex items-center justify-between border border-border">
                                <span className="text-xs font-mono truncate mr-2">{address}</span>
                                <Button size="sm" variant="ghost" onClick={() => {
                                    navigator.clipboard.writeText(address || '');
                                    toast.success('Copied to clipboard');
                                }}>
                                    Copy
                                </Button>
                            </div>
                            <div className="pt-4 text-center w-full mt-2">
                                <Link to="/create" onClick={() => setReceiveOpen(false)} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                                    Want a custom link with exact amounts? <span className="underline">Generate Payment Link</span>
                                </Link>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>


            </div>

            {/* Quick Actions / Info row — clickable cards */}
            <div className="grid md:grid-cols-2 gap-6">
                <button
                    type="button"
                    onClick={() => setSendOpen(true)}
                    className="glass-card p-6 rounded-2xl group flex items-start gap-4 text-left w-full cursor-pointer hover:border-primary/50 transition-colors"
                >
                    <div className="p-3 bg-primary/10 text-primary rounded-xl group-hover:scale-110 transition-transform shrink-0">
                        <ArrowUpRight className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Send to anyone</h3>
                        <p className="text-sm text-muted-foreground">Instantly transfer USDC across the Arc Testnet securely and cheaply.</p>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => setReceiveOpen(true)}
                    className="glass-card p-6 rounded-2xl group flex items-start gap-4 text-left w-full cursor-pointer hover:border-primary/50 transition-colors"
                >
                    <div className="p-3 bg-accent/10 text-accent rounded-xl group-hover:scale-110 transition-transform shrink-0">
                        <ArrowDownLeft className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Receive funds</h3>
                        <p className="text-sm text-muted-foreground">Share your QR code or address to receive quick payouts directly to your wallet.</p>
                    </div>
                </button>
                <Link
                    to="/dashboard?tab=batch"
                    className="glass-card p-6 rounded-2xl group flex items-start gap-4 hover:border-primary/50 transition-colors"
                >
                    <div className="p-3 bg-primary/10 text-primary rounded-xl group-hover:scale-110 transition-transform shrink-0">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Send Batch</h3>
                        <p className="text-sm text-muted-foreground">Pay multiple wallets at once. Manage payroll, splits, and group expenses seamlessly.</p>
                    </div>
                </Link>
                <Link
                    to="/dashboard?tab=links"
                    className="glass-card p-6 rounded-2xl group flex items-start gap-4 hover:border-primary/50 transition-colors"
                >
                    <div className="p-3 bg-accent/10 text-accent rounded-xl group-hover:scale-110 transition-transform shrink-0">
                        <LinkIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Payment Links</h3>
                        <p className="text-sm text-muted-foreground">Generate shareable links to request exact USDC amounts from anyone on Arc.</p>
                    </div>
                </Link>
            </div>
        </div>
    );
}
