import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, LogIn, ExternalLink, Receipt as ReceiptIcon, Copy, Check, Link2 } from 'lucide-react';
import { PaymentLinkCard } from '@/components/PaymentLinkCard';
import { BatchRequestCard } from '@/components/BatchRequestCard';
import { supabase } from '@/integrations/supabase/client';
import { useBatchRequests, BatchRecipient } from '@/hooks/useBatchRequests';
import { useProfiles } from '@/hooks/useProfiles';
import { usePaymentLinks } from '@/hooks/usePaymentLinks';
import { WalletTab } from '@/components/WalletTab';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function DashboardPage() {
    const { address, isConnected } = useAccount();
    const { setShowAuthFlow } = useDynamicContext();
    const [searchParams, setSearchParams] = useSearchParams();

    const defaultTab = searchParams.get('tab') || 'wallet';

    const [links, setLinks] = useState<any[]>([]);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [batchRequests, setBatchRequests] = useState<any[]>([]);

    const [loadingLinks, setLoadingLinks] = useState(false);
    const [loadingReceipts, setLoadingReceipts] = useState(false);

    const { getBatchRequestsByWallet, createBatchRequest, loading: batchLoading } = useBatchRequests();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [batchTitle, setBatchTitle] = useState('');
    const [batchDesc, setBatchDesc] = useState('');
    const [batchRecipients, setBatchRecipients] = useState<BatchRecipient[]>([{ wallet: '', amount: 0, label: '' }]);

    const { resolveUsernameToWallet } = useProfiles();
    const { createLinks, loading: linkCreating } = usePaymentLinks();

    const [isLinkCreateOpen, setIsLinkCreateOpen] = useState(false);
    const [linkRecipient, setLinkRecipient] = useState('');
    const [linkAmount, setLinkAmount] = useState('');
    const [linkExpiresAt, setLinkExpiresAt] = useState('');
    const [linkMaxUses, setLinkMaxUses] = useState('');
    const [createdLinkId, setCreatedLinkId] = useState<string | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);

    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

    useEffect(() => {
        if (address) {
            fetchLinks();
            fetchReceipts();
            fetchBatches();
        }
    }, [address]);

    const fetchLinks = async () => {
        if (!address) return;
        setLoadingLinks(true);
        const { data } = await supabase
            .from('payment_links')
            .select('*')
            .eq('receiver_wallet', address)
            .order('created_at', { ascending: false });
        setLinks(data || []);
        setLoadingLinks(false);
    };

    const fetchReceipts = async () => {
        if (!address) return;
        setLoadingReceipts(true);
        const { data } = await supabase
            .from('receipts')
            .select('*')
            .or(`sender.eq.${address},receiver.eq.${address}`)
            .order('created_at', { ascending: false });
        setReceipts(data || []);
        setLoadingReceipts(false);
    };

    const fetchBatches = async () => {
        if (!address) return;
        const requests = await getBatchRequestsByWallet(address);
        setBatchRequests(requests);
    };

    const handleCreateLink = async () => {
        if (!address) return;
        const amt = parseFloat(linkAmount);
        if (!linkRecipient || isNaN(amt) || amt <= 0) {
            return toast.error('Please enter a valid recipient and amount');
        }

        let finalWallet = linkRecipient;
        if (!linkRecipient.startsWith('0x') || linkRecipient.length !== 42) {
            const resolved = await resolveUsernameToWallet(linkRecipient);
            if (!resolved) return toast.error(`Could not resolve: ${linkRecipient}`);
            finalWallet = resolved;
        }

        const data = await createLinks([{
            receiver_wallet: finalWallet,
            amount: amt,
            expires_at: linkExpiresAt ? new Date(linkExpiresAt).toISOString() : null,
            max_uses: linkMaxUses ? parseInt(linkMaxUses) : null,
            current_uses: 0,
            group_id: null,
        }]);

        if (data && data.length > 0) {
            setCreatedLinkId(data[0].id);
            toast.success('Payment link created!');
            fetchLinks();
        }
    };

    const resetLinkForm = () => {
        setLinkRecipient('');
        setLinkAmount('');
        setLinkExpiresAt('');
        setLinkMaxUses('');
        setCreatedLinkId(null);
        setLinkCopied(false);
    };

    const handleCreateBatch = async () => {
        if (!address) return;

        // Validation & Username Resolution
        const resolvedRecipients: BatchRecipient[] = [];

        for (const r of batchRecipients) {
            if (!r.wallet || r.amount <= 0) continue;

            let finalWallet = r.wallet;
            // If it's not a standard ETH address, try resolving it as a username
            if (!r.wallet.startsWith('0x') || r.wallet.length !== 42) {
                const resolved = await resolveUsernameToWallet(r.wallet);
                if (!resolved) {
                    toast.error(`Could not resolve username: ${r.wallet}`);
                    return; // abort creation
                }
                finalWallet = resolved;
            }
            resolvedRecipients.push({ ...r, wallet: finalWallet });
        }

        if (resolvedRecipients.length === 0) {
            toast.error('Please add at least one valid recipient or username');
            return;
        }

        const totalAmount = resolvedRecipients.reduce((sum, r) => sum + Number(r.amount), 0);

        const newBatch = await createBatchRequest({
            title: batchTitle,
            description: batchDesc,
            creator_wallet: address,
            recipients: resolvedRecipients,
            total_amount: totalAmount,
            expires_at: null, // optional feature
        });

        if (newBatch) {
            toast.success('Batch request created!');
            setIsCreateOpen(false);
            fetchBatches(); // refesh list
        }
    };

    if (!isConnected) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
                <div className="glass-card p-10 rounded-2xl text-center max-w-lg space-y-6">
                    <div className="bg-primary/20 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                        <LogIn className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold">Login to view balances</h2>
                    <p className="text-muted-foreground">
                        Please log in to view your Dashboard, manage links, and track payment requests.
                    </p>
                    <Button
                        size="lg"
                        onClick={() => setShowAuthFlow(true)}
                        className="w-full gradient-primary shadow-glow hover:shadow-glow-lg h-12"
                    >
                        Login to view balances
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold gradient-text mb-8">Dashboard</h1>

            <Tabs defaultValue={defaultTab} onValueChange={(v) => setSearchParams({ tab: v })}>
                <TabsList className="bg-secondary/50 border border-border p-1 mb-8 w-full justify-start overflow-x-auto flex-nowrap">
                    <TabsTrigger value="wallet" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Wallet</TabsTrigger>
                    <TabsTrigger value="links" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">My Links</TabsTrigger>
                    <TabsTrigger value="batch" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Batch Requests</TabsTrigger>
                    <TabsTrigger value="receipts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Receipts</TabsTrigger>
                </TabsList>

                {/* WALLET TAB */}
                <TabsContent value="wallet" className="animate-in fade-in-50 zoom-in-95">
                    <WalletTab />
                </TabsContent>

                {/* LINKS TAB */}
                <TabsContent value="links" className="space-y-6">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-semibold">Your Payment Links</h2>
                        <Dialog open={isLinkCreateOpen} onOpenChange={(open) => { setIsLinkCreateOpen(open); if (!open) resetLinkForm(); }}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus size={16} /> New Payment Link
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md bg-card border-border">
                                <DialogHeader>
                                    <DialogTitle>Create Payment Link</DialogTitle>
                                </DialogHeader>

                                {createdLinkId ? (
                                    /* ── Success state ── */
                                    <div className="space-y-4 py-4">
                                        <p className="text-sm text-muted-foreground text-center">Your payment link is ready to share!</p>
                                        <div className="flex items-center gap-2 bg-secondary rounded-xl p-3 border border-border">
                                            <code className="flex-1 text-xs font-mono break-all text-foreground">
                                                {`${appUrl}/pay?link=${createdLinkId}`}
                                            </code>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${appUrl}/pay?link=${createdLinkId}`);
                                                    setLinkCopied(true);
                                                    toast.success('Copied to clipboard!');
                                                    setTimeout(() => setLinkCopied(false), 2000);
                                                }}
                                            >
                                                {linkCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                            </Button>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <Button variant="outline" className="flex-1" onClick={resetLinkForm}>
                                                Create Another
                                            </Button>
                                            <Button className="flex-1 gradient-primary" onClick={() => { setIsLinkCreateOpen(false); resetLinkForm(); }}>
                                                Done
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    /* ── Form state ── */
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Recipient (username or 0x…)</label>
                                            <input
                                                value={linkRecipient}
                                                onChange={e => setLinkRecipient(e.target.value)}
                                                placeholder="@satoshi or 0x..."
                                                className="w-full bg-secondary border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Amount (USDC)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={linkAmount}
                                                    onChange={e => setLinkAmount(e.target.value)}
                                                    placeholder="0.00"
                                                    min="0"
                                                    step="0.01"
                                                    className="w-full bg-secondary border border-border rounded-xl p-3 pl-8 outline-none focus:ring-2 focus:ring-primary"
                                                />
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Expires (optional)</label>
                                                <input
                                                    type="datetime-local"
                                                    value={linkExpiresAt}
                                                    onChange={e => setLinkExpiresAt(e.target.value)}
                                                    className="w-full bg-secondary border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Max Uses (optional)</label>
                                                <input
                                                    type="number"
                                                    value={linkMaxUses}
                                                    onChange={e => setLinkMaxUses(e.target.value)}
                                                    placeholder="e.g. 5"
                                                    min="1"
                                                    className="w-full bg-secondary border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-3 pt-2 border-t border-border">
                                            <Button variant="ghost" onClick={() => setIsLinkCreateOpen(false)}>Cancel</Button>
                                            <Button
                                                onClick={handleCreateLink}
                                                disabled={linkCreating || !linkRecipient || !linkAmount}
                                                className="gap-2"
                                            >
                                                {linkCreating ? <Loader2 className="animate-spin w-4 h-4" /> : <Link2 size={14} />}
                                                Generate Link
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="flex gap-8 bg-secondary/30 p-4 rounded-xl border border-border">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Links</p>
                            <p className="text-2xl font-bold">{links.length}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total Volume Requested</p>
                            <p className="text-2xl font-bold text-primary">
                                {links.reduce((acc, curr) => acc + Number(curr.amount), 0).toFixed(2)} USDC
                            </p>
                        </div>
                    </div>

                    {loadingLinks ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
                    ) : links.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">No payment links found.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {links.map((link) => (
                                <PaymentLinkCard key={link.id} linkData={link} />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* BATCH REQUESTS TAB */}
                <TabsContent value="batch" className="space-y-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold">Your Batch Requests</h2>
                        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus size={16} /> New Batch Request
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Create Batch Request</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Title (optional)</label>
                                        <input
                                            value={batchTitle}
                                            onChange={e => setBatchTitle(e.target.value)}
                                            className="w-full bg-secondary border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                                            placeholder="Quarterly Bonus..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                                        <textarea
                                            value={batchDesc}
                                            onChange={e => setBatchDesc(e.target.value)}
                                            className="w-full bg-secondary border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
                                            placeholder="Payment for Q3 milestones..."
                                        />
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-border">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-medium">Recipients</h4>
                                        </div>
                                        {batchRecipients.map((rec, i) => (
                                            <div key={i} className="flex gap-3 items-start">
                                                <div className="flex-1">
                                                    <input
                                                        value={rec.wallet}
                                                        onChange={e => {
                                                            const newR = [...batchRecipients];
                                                            newR[i].wallet = e.target.value;
                                                            setBatchRecipients(newR);
                                                        }}
                                                        placeholder="0x..."
                                                        className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
                                                    />
                                                </div>
                                                <div className="w-24">
                                                    <input
                                                        type="number"
                                                        value={rec.amount || ''}
                                                        onChange={e => {
                                                            const newR = [...batchRecipients];
                                                            newR[i].amount = Number(e.target.value);
                                                            setBatchRecipients(newR);
                                                        }}
                                                        placeholder="USDC"
                                                        className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                                    />
                                                </div>
                                                <div className="w-32">
                                                    <input
                                                        value={rec.label || ''}
                                                        onChange={e => {
                                                            const newR = [...batchRecipients];
                                                            newR[i].label = e.target.value;
                                                            setBatchRecipients(newR);
                                                        }}
                                                        placeholder="Label"
                                                        className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                                    />
                                                </div>
                                                {batchRecipients.length > 1 && (
                                                    <Button variant="ghost" className="text-destructive px-2" onClick={() => setBatchRecipients(batchRecipients.filter((_, idx) => idx !== i))}>
                                                        ×
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-dashed"
                                            onClick={() => setBatchRecipients([...batchRecipients, { wallet: '', amount: 0, label: '' }])}
                                        >
                                            <Plus size={14} className="mr-1" /> Add Recipient
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                    <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                                    <Button onClick={handleCreateBatch} disabled={batchLoading}>
                                        {batchLoading ? <Loader2 className="animate-spin mr-2 w-4 h-4" /> : null}
                                        Create Request
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {batchLoading && batchRequests.length === 0 ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
                    ) : batchRequests.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">No batch requests found.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {batchRequests.map((req) => (
                                <BatchRequestCard key={req.id} request={req} />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* RECEIPTS TAB */}
                <TabsContent value="receipts" className="space-y-6">
                    {loadingReceipts ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
                    ) : receipts.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">No receipts found.</div>
                    ) : (
                        <div className="space-y-4">
                            {receipts.map((r) => {
                                const isSender = r.sender.toLowerCase() === address.toLowerCase();
                                return (
                                    <div key={r.id} className="glass-card p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-full ${isSender ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                                <ReceiptIcon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">{isSender ? 'Sent' : 'Received'} {r.amount} USDC</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {new Date(r.created_at).toLocaleDateString()} at {new Date(r.created_at).toLocaleTimeString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:items-end gap-1 text-sm font-mono text-muted-foreground">
                                            <span>From: {r.sender.slice(0, 6)}...{r.sender.slice(-4)}</span>
                                            <span>To: {r.receiver.slice(0, 6)}...{r.receiver.slice(-4)}</span>
                                        </div>
                                        <a
                                            href={`https://testnet.arcscan.app/tx/${r.tx_hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 rounded-lg bg-secondary hover:bg-muted transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                                        >
                                            Explorer <ExternalLink size={14} />
                                        </a>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>

            </Tabs>

        </div>
    );
}
