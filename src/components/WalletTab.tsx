import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { createPublicClient, http, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Send, Download, Loader2, ArrowUpRight, ArrowDownLeft, Users, Link as LinkIcon, ReceiptText, RefreshCw, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProfiles } from '@/hooks/useProfiles';
import { useArcSend } from '@/hooks/useArcSend';
import { Link, useNavigate } from 'react-router-dom';
import { ChainEnvironmentToggle } from '@/components/ChainEnvironmentToggle';
import {
    getDefaultQevorChainForEnvironment,
    getExplorerTxUrl,
    getQevorChainById,
    getQevorChainByKey,
    getQevorChainsByEnvironment,
    type QevorChainEnvironment,
    type QevorChainKey,
} from '@/lib/chains';

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

type WalletActivityKind = 'direct' | 'batch-payment' | 'batch-request' | 'payment-link';
type WalletActivityDirection = 'sent' | 'received' | 'created';

interface WalletActivity {
    id: string;
    kind: WalletActivityKind;
    direction: WalletActivityDirection;
    title: string;
    subtitle: string;
    amount: number;
    token: string;
    chainId: number;
    status: string;
    createdAt: string;
    txHash?: string | null;
}

const normalizeWallet = (wallet?: string | null) => wallet?.toLowerCase() ?? '';

const formatShortAddress = (wallet?: string | null) => {
    if (!wallet) return 'Unknown wallet';
    if (wallet.length <= 14) return wallet;
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
};

const formatActivityDate = (date: string) => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return 'Unknown date';
    return parsed.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export function WalletTab() {
    const { address } = useAccount();
    const [displayBalance, setDisplayBalance] = useState('0.0000');
    const [chainEnvironment, setChainEnvironment] = useState<QevorChainEnvironment>('testnet');
    const [chainKey, setChainKey] = useState<QevorChainKey>(() => getDefaultQevorChainForEnvironment('testnet').key);
    const [activities, setActivities] = useState<WalletActivity[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const selectedNetwork = getQevorChainByKey(chainKey);
    const availableChains = getQevorChainsByEnvironment(chainEnvironment);

    const handleChainEnvironmentChange = (environment: QevorChainEnvironment) => {
        setChainEnvironment(environment);
        setChainKey(getDefaultQevorChainForEnvironment(environment).key);
        setDisplayBalance('0.0000');
    };

    const fetchBalance = useCallback(async () => {
        if (!address) return;
        try {
            const client = createPublicClient({
                chain: selectedNetwork.chain,
                transport: http(selectedNetwork.rpcUrls[0]),
            });
            const native = await client.getBalance({ address });
            if (native > 0n) {
                setDisplayBalance(parseFloat(formatUnits(native, selectedNetwork.chain.nativeCurrency.decimals)).toFixed(4));
                return;
            }
            if (selectedNetwork.key !== 'arc-testnet') {
                setDisplayBalance('0.0000');
                return;
            }
            const erc20 = await client.readContract({
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [address],
            });
            setDisplayBalance(parseFloat(formatUnits(erc20, 18)).toFixed(4));
        } catch {
            // silently keep last known value
        }
    }, [address, selectedNetwork]);

    const fetchActivity = useCallback(async () => {
        if (!address) {
            setActivities([]);
            return;
        }

        setActivityLoading(true);
        try {
            const wallet = normalizeWallet(address);
            const walletFilter = `sender.ilike.${address},receiver.ilike.${address}`;
            const batchPaymentFilter = `payer_wallet.ilike.${address},recipient_wallet.ilike.${address}`;
            const linkFilter = `creator_wallet.ilike.${address},receiver_wallet.ilike.${address}`;

            const [receiptResult, batchPaymentResult, batchRequestResult, linkResult] = await Promise.all([
                supabase
                    .from('receipts')
                    .select('*')
                    .or(walletFilter)
                    .order('created_at', { ascending: false })
                    .limit(25),
                supabase
                    .from('batch_payments')
                    .select('*')
                    .or(batchPaymentFilter)
                    .order('created_at', { ascending: false })
                    .limit(25),
                supabase
                    .from('batch_requests')
                    .select('*')
                    .ilike('creator_wallet', address)
                    .order('created_at', { ascending: false })
                    .limit(25),
                supabase
                    .from('payment_links')
                    .select('*')
                    .or(linkFilter)
                    .order('created_at', { ascending: false })
                    .limit(25),
            ]);

            const next: WalletActivity[] = [];

            if (receiptResult.data) {
                for (const receipt of receiptResult.data as any[]) {
                    const chain = getQevorChainById(receipt.chain_id);
                    const direction: WalletActivityDirection = normalizeWallet(receipt.sender) === wallet ? 'sent' : 'received';
                    const otherWallet = direction === 'sent' ? receipt.receiver : receipt.sender;
                    next.push({
                        id: `receipt-${receipt.id}`,
                        kind: 'direct',
                        direction,
                        title: direction === 'sent' ? 'Direct send' : 'Direct receive',
                        subtitle: `${direction === 'sent' ? 'To' : 'From'} ${formatShortAddress(otherWallet)} on ${chain.label}`,
                        amount: Number(receipt.amount ?? 0),
                        token: receipt.token_symbol ?? chain.paymentAsset,
                        chainId: receipt.chain_id ?? chain.chain.id,
                        status: receipt.status ?? 'paid',
                        createdAt: receipt.created_at,
                        txHash: receipt.tx_hash,
                    });
                }
            }

            if (batchPaymentResult.data) {
                for (const payment of batchPaymentResult.data as any[]) {
                    const chain = getQevorChainById(payment.chain_id);
                    const direction: WalletActivityDirection = normalizeWallet(payment.payer_wallet) === wallet ? 'sent' : 'received';
                    const otherWallet = direction === 'sent' ? payment.recipient_wallet : payment.payer_wallet;
                    next.push({
                        id: `batch-payment-${payment.id}`,
                        kind: 'batch-payment',
                        direction,
                        title: direction === 'sent' ? 'Batch payout' : 'Batch payment received',
                        subtitle: `${direction === 'sent' ? 'To' : 'From'} ${formatShortAddress(otherWallet)} on ${chain.label}`,
                        amount: Number(payment.amount ?? 0),
                        token: payment.token_symbol ?? chain.paymentAsset,
                        chainId: payment.chain_id ?? chain.chain.id,
                        status: payment.status ?? 'paid',
                        createdAt: payment.created_at,
                        txHash: payment.tx_hash,
                    });
                }
            }

            if (batchRequestResult.data) {
                for (const batch of batchRequestResult.data as any[]) {
                    const chain = getQevorChainById(batch.chain_id);
                    const recipients = Array.isArray(batch.recipients) ? batch.recipients.length : 0;
                    next.push({
                        id: `batch-request-${batch.id}`,
                        kind: 'batch-request',
                        direction: 'created',
                        title: batch.title || 'Batch payment plan',
                        subtitle: `${recipients} recipient${recipients === 1 ? '' : 's'} on ${chain.label}`,
                        amount: Number(batch.total_amount ?? 0),
                        token: batch.token_symbol ?? chain.paymentAsset,
                        chainId: batch.chain_id ?? chain.chain.id,
                        status: batch.status ?? 'pending',
                        createdAt: batch.created_at,
                    });
                }
            }

            if (linkResult.data) {
                for (const link of linkResult.data as any[]) {
                    const chain = getQevorChainById(link.chain_id);
                    const direction: WalletActivityDirection = normalizeWallet(link.creator_wallet) === wallet ? 'created' : 'received';
                    next.push({
                        id: `payment-link-${link.id}`,
                        kind: 'payment-link',
                        direction,
                        title: direction === 'created' ? 'Payment link created' : 'Payment link assigned',
                        subtitle: `${formatShortAddress(link.receiver_wallet)} on ${chain.label}`,
                        amount: Number(link.amount ?? 0),
                        token: link.token_symbol ?? chain.paymentAsset,
                        chainId: link.chain_id ?? chain.chain.id,
                        status: 'link',
                        createdAt: link.created_at,
                    });
                }
            }

            setActivities(
                next
                    .filter((activity) => activity.createdAt)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 12),
            );
        } catch (error) {
            console.error('Error loading wallet activity:', error);
            toast.error('Could not load wallet history');
        } finally {
            setActivityLoading(false);
        }
    }, [address]);

    useEffect(() => {
        fetchBalance();
        fetchActivity();
        const id = setInterval(fetchBalance, 5000);
        return () => clearInterval(id);
    }, [fetchActivity, fetchBalance]);

    const refetch = () => {
        setTimeout(fetchBalance, 1000);
        setTimeout(fetchBalance, 4000);
        setTimeout(fetchBalance, 10000);
        setTimeout(fetchActivity, 1500);
        setTimeout(fetchActivity, 6000);
    };
    const navigate = useNavigate();

    const [sendOpen, setSendOpen] = useState(false);
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');

    const { sendTransaction, isPending } = useArcSend();

    const { resolveUsernameToWallet } = useProfiles();

    const recordDirectReceipt = async (receiver: string, sentAmount: string, txHash?: string) => {
        if (!address || !txHash) return;

        const receipt = {
            sender: address,
            receiver,
            amount: Number(sentAmount),
            tx_hash: txHash,
            status: 'paid',
            memo: `Direct ${selectedNetwork.paymentAsset} transfer`,
            chain_id: selectedNetwork.chain.id,
            token_symbol: selectedNetwork.paymentAsset,
        };

        const { error } = await supabase.from('receipts').insert([receipt]);
        if (error) {
            console.error('Error recording direct send receipt:', error);
            toast.warning('Transaction sent, but Qevor could not save the receipt yet.');
            return;
        }

        fetchActivity();
    };

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
            chainKey,
            onSuccess(hash) {
                toast.success('Transaction sent!', { description: hash ? `Hash: ${hash.slice(0, 10)}...` : '' });
                void recordDirectReceipt(finalRecipient, amount, hash);
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

    const renderActivityIcon = (activity: WalletActivity) => {
        if (activity.status === 'pending' || activity.status === 'queued') {
            return <Clock className="w-5 h-5" />;
        }
        if (activity.kind === 'payment-link') {
            return <LinkIcon className="w-5 h-5" />;
        }
        if (activity.kind === 'batch-payment' || activity.kind === 'batch-request') {
            return <Users className="w-5 h-5" />;
        }
        return activity.direction === 'received' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />;
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
                <p className="text-primary/80 font-medium mb-4">{selectedNetwork.paymentAsset} ({selectedNetwork.label})</p>
                <div className="w-full max-w-xs mb-8">
                    <ChainEnvironmentToggle
                        value={chainEnvironment}
                        onChange={handleChainEnvironmentChange}
                        className="mb-3"
                    />
                    <select
                        value={chainKey}
                        onChange={(e) => {
                            setChainKey(e.target.value as QevorChainKey);
                            setDisplayBalance('0.0000');
                        }}
                        className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    >
                        {availableChains.map(network => (
                            <option key={network.key} value={network.key}>
                                {network.label} ({network.paymentAsset})
                            </option>
                        ))}
                    </select>
                </div>

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
                                <DialogTitle>Send {selectedNetwork.paymentAsset}</DialogTitle>
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
                                    <label className="text-sm font-medium">Amount ({selectedNetwork.paymentAsset})</label>
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
                                        Need to send to multiple people? <span className="underline">Create a Batch Payment</span>
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
                                <DialogTitle className="text-center text-xl">Receive {selectedNetwork.paymentAsset}</DialogTitle>
                                <p className="text-muted-foreground text-sm">Scan to send funds on {selectedNetwork.label}</p>
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
                        <p className="text-sm text-muted-foreground">Instantly transfer {selectedNetwork.paymentAsset} across {selectedNetwork.label} securely and cheaply.</p>
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
                        <p className="text-sm text-muted-foreground">Generate shareable links to request exact amounts on Arc, Mantle Sepolia, or Mantle Mainnet.</p>
                    </div>
                </Link>
            </div>

            <section className="glass-card rounded-2xl overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-primary">
                            <ReceiptText className="w-4 h-4" />
                            <span className="text-xs font-semibold uppercase tracking-widest">Wallet history</span>
                        </div>
                        <h3 className="mt-2 text-xl font-semibold">Recent wallet activity</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Direct sends, batch payouts, payment links, and receipts tied to this wallet.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={fetchActivity}
                        disabled={activityLoading}
                        className="rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                    >
                        {activityLoading ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <RefreshCw className="mr-2 w-4 h-4" />}
                        Refresh
                    </Button>
                </div>

                {activityLoading && activities.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading wallet history...
                    </div>
                ) : activities.length === 0 ? (
                    <div className="p-10 text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <ReceiptText className="w-6 h-6" />
                        </div>
                        <h4 className="font-semibold">No wallet activity yet</h4>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            Your next direct transfer, batch payment, receipt, or payment link will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {activities.map((activity) => {
                            const explorerUrl = activity.txHash ? getExplorerTxUrl(activity.chainId, activity.txHash) : null;
                            const isReceived = activity.direction === 'received';
                            const amountPrefix = isReceived ? '+' : activity.direction === 'sent' ? '-' : '';

                            return (
                                <div key={activity.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-start gap-4">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                            {renderActivityIcon(activity)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="font-semibold">{activity.title}</h4>
                                                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
                                                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                    {activity.status}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">{activity.subtitle}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{formatActivityDate(activity.createdAt)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                                        <div className="text-left sm:text-right">
                                            <div className={`text-lg font-bold ${isReceived ? 'text-emerald-400' : 'text-foreground'}`}>
                                                {amountPrefix}{activity.amount.toFixed(4)} {activity.token}
                                            </div>
                                            {activity.txHash && (
                                                <div className="text-xs font-mono text-muted-foreground">
                                                    {formatShortAddress(activity.txHash)}
                                                </div>
                                            )}
                                        </div>
                                        {explorerUrl && (
                                            <a
                                                href={explorerUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary transition-colors hover:border-primary/60 hover:bg-primary/5"
                                                aria-label="Open transaction in explorer"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
