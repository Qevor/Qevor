import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, LogIn, ExternalLink, Receipt as ReceiptIcon, Copy, Check, Link2, ArrowDownLeft, ArrowUpRight, Users, CheckCircle2, XCircle } from 'lucide-react';
import { PaymentLinkCard } from '@/components/PaymentLinkCard';
import { BatchPaymentCard } from '@/components/BatchPaymentCard';
import { SplitInput } from '@/components/SplitInput';
import { supabase } from '@/integrations/supabase/client';
import { useBatchPayments, BatchRecipient, BatchPayment } from '@/hooks/useBatchPayments';
import { useProfiles } from '@/hooks/useProfiles';
import { usePaymentLinks } from '@/hooks/usePaymentLinks';
import { WalletTab } from '@/components/WalletTab';
import { useArcSend } from '@/hooks/useArcSend';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function DashboardPage() {
    const { address, isConnected } = useAccount();
    const { setShowAuthFlow } = useDynamicContext();
    const [searchParams, setSearchParams] = useSearchParams();

    const defaultTab = searchParams.get('tab') || 'wallet';

    const [links, setLinks] = useState<any[]>([]);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [batches, setBatches] = useState<any[]>([]);

    const [loadingLinks, setLoadingLinks] = useState(false);
    const [loadingReceipts, setLoadingReceipts] = useState(false);

    const { getBatchesByWallet, createBatch, getBatchPaymentsByWallet, recordBatchPayment, updateBatchStatus, loading: batchLoading } = useBatchPayments();
    const { sendTransaction } = useArcSend();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [batchTitle, setBatchTitle] = useState('');
    const [batchDesc, setBatchDesc] = useState('');
    const [batchRecipients, setBatchRecipients] = useState<BatchRecipient[]>([{ wallet: '', amount: 0, label: '' }]);

    type SendStep = 'form' | 'sending' | 'done';
    type SendResult = { wallet: string; amount: number; label?: string; txHash?: string; success: boolean };
    const [batchSendStep, setBatchSendStep] = useState<SendStep>('form');
    const [batchSendProgress, setBatchSendProgress] = useState({ current: 0, total: 0 });
    const [batchSendResults, setBatchSendResults] = useState<SendResult[]>([]);

    const { resolveUsernameToWallet } = useProfiles();
    const { createLinks, loading: linkCreating } = usePaymentLinks();

    // New Payment Link dialog state
    const [isLinkCreateOpen, setIsLinkCreateOpen] = useState(false);
    const [linkRecipient, setLinkRecipient] = useState('');
    const [linkAmount, setLinkAmount] = useState('');
    const [linkSplitMode, setLinkSplitMode] = useState(false);
    const [linkSplitAmounts, setLinkSplitAmounts] = useState<number[]>([]);
    const [linkExpiresAt, setLinkExpiresAt] = useState('');
    const [linkUnlimitedUses, setLinkUnlimitedUses] = useState(true);
    const [linkMaxUses, setLinkMaxUses] = useState('');
    const [createdLinks, setCreatedLinks] = useState<Array<{ id: string; amount: number }>>([]);
    const [copiedLinkIds, setCopiedLinkIds] = useState<Set<string>>(new Set());

    // Receipts — batch payment groups
    const [batchReceiptGroups, setBatchReceiptGroups] = useState<Array<{
        batchId: string;
        totalAmount: number;
        count: number;
        latestTxHash: string;
        createdAt: string;
    }>>([]);

    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

    useEffect(() => {
        if (address) {
            fetchLinks();
            fetchReceipts();
            fetchBatches();
            fetchBatchReceiptGroups();
        }
    }, [address]);

    const fetchLinks = async () => {
        if (!address) return;
        setLoadingLinks(true);
        const { data } = await supabase
            .from('payment_links')
            .select('*')
            .ilike('receiver_wallet', address)   // case-insensitive match for EIP-55 addresses
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
        const results = await getBatchesByWallet(address);
        setBatches(results);
    };

    const fetchBatchReceiptGroups = async () => {
        if (!address) return;
        const payments = await getBatchPaymentsByWallet(address);
        // Group by batch_request_id
        const groups: Record<string, { batchId: string; totalAmount: number; count: number; latestTxHash: string; createdAt: string }> = {};
        for (const p of payments) {
            if (!groups[p.batch_request_id]) {
                groups[p.batch_request_id] = { batchId: p.batch_request_id, totalAmount: 0, count: 0, latestTxHash: p.tx_hash, createdAt: p.created_at };
            }
            groups[p.batch_request_id].totalAmount += Number(p.amount);
            groups[p.batch_request_id].count += 1;
        }
        setBatchReceiptGroups(Object.values(groups).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };

    const handleCreateLink = async () => {
        if (!address) return;

        // Resolve recipient
        let finalWallet = linkRecipient.trim();
        if (!finalWallet) return toast.error('Please enter a recipient');
        if (!finalWallet.startsWith('0x') || finalWallet.length !== 42) {
            const resolved = await resolveUsernameToWallet(finalWallet);
            if (!resolved) return toast.error(`Could not resolve: ${finalWallet}`);
            finalWallet = resolved;
        }

        const expiresAtISO = linkExpiresAt ? new Date(linkExpiresAt).toISOString() : null;
        const maxUsesVal = linkUnlimitedUses ? null : (linkMaxUses ? parseInt(linkMaxUses) : null);
        const groupId = linkSplitMode ? crypto.randomUUID() : null;

        const amountsToCreate = linkSplitMode
            ? linkSplitAmounts
            : [parseFloat(linkAmount)];

        if (amountsToCreate.length === 0 || amountsToCreate.some(a => isNaN(a) || a <= 0)) {
            return toast.error('Please enter a valid amount');
        }

        const linksPayload = amountsToCreate.map(amt => ({
            receiver_wallet: finalWallet,
            amount: amt,
            expires_at: expiresAtISO,
            max_uses: maxUsesVal,
            current_uses: 0,
            group_id: groupId,
        }));

        const data = await createLinks(linksPayload);
        if (data && data.length > 0) {
            setCreatedLinks(data.map((l: any) => ({ id: l.id, amount: l.amount })));
            toast.success(linkSplitMode ? `${data.length} split links created!` : 'Payment link created!');
            fetchLinks();
        }
    };

    const resetLinkForm = () => {
        setLinkRecipient('');
        setLinkAmount('');
        setLinkSplitMode(false);
        setLinkSplitAmounts([]);
        setLinkExpiresAt('');
        setLinkUnlimitedUses(true);
        setLinkMaxUses('');
        setCreatedLinks([]);
        setCopiedLinkIds(new Set());
    };

    const handleCopyLink = (linkId: string, url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedLinkIds(prev => new Set(prev).add(linkId));
        toast.success('Copied to clipboard!');
        setTimeout(() => setCopiedLinkIds(prev => { const n = new Set(prev); n.delete(linkId); return n; }), 2000);
    };

    const resetBatchForm = () => {
        setBatchTitle('');
        setBatchDesc('');
        setBatchRecipients([{ wallet: '', amount: 0, label: '' }]);
        setBatchSendStep('form');
        setBatchSendProgress({ current: 0, total: 0 });
        setBatchSendResults([]);
    };

    const handleSendBatch = async () => {
        if (!address) return;

        // Validate & resolve usernames
        const resolvedRecipients: BatchRecipient[] = [];
        for (const r of batchRecipients) {
            if (!r.wallet || r.amount <= 0) continue;
            let finalWallet = r.wallet;
            if (!r.wallet.startsWith('0x') || r.wallet.length !== 42) {
                const resolved = await resolveUsernameToWallet(r.wallet);
                if (!resolved) {
                    toast.error(`Could not resolve username: ${r.wallet}`);
                    return;
                }
                finalWallet = resolved;
            }
            resolvedRecipients.push({ ...r, wallet: finalWallet });
        }

        if (resolvedRecipients.length === 0) {
            toast.error('Please add at least one valid recipient');
            return;
        }

        const totalAmount = resolvedRecipients.reduce((sum, r) => sum + Number(r.amount), 0);

        // Create batch record before sending (acts as the receipt container)
        const newBatch = await createBatch({
            title: batchTitle || undefined,
            description: batchDesc || undefined,
            creator_wallet: address,
            recipients: resolvedRecipients,
            total_amount: totalAmount,
            expires_at: null,
        });

        if (!newBatch) {
            toast.error('Failed to initialise batch payment');
            return;
        }

        setBatchSendStep('sending');
        setBatchSendProgress({ current: 0, total: resolvedRecipients.length });

        const results: SendResult[] = [];

        for (let i = 0; i < resolvedRecipients.length; i++) {
            const recipient = resolvedRecipients[i];
            setBatchSendProgress({ current: i + 1, total: resolvedRecipients.length });

            try {
                const txHash = await new Promise<string>((resolve, reject) => {
                    sendTransaction({
                        to: recipient.wallet,
                        amount: recipient.amount.toString(),
                        onSuccess: resolve,
                        onError: reject,
                    });
                });
                await recordBatchPayment(newBatch.id, address, recipient.wallet, recipient.amount, txHash);
                results.push({ ...recipient, txHash, success: true });
            } catch {
                results.push({ ...recipient, success: false });
            }
        }

        const successCount = results.filter(r => r.success).length;
        await updateBatchStatus(
            newBatch.id,
            successCount === resolvedRecipients.length ? 'complete' : successCount > 0 ? 'partial' : 'pending'
        );

        setBatchSendResults(results);
        setBatchSendStep('done');
        fetchBatches();
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

            <Tabs value={defaultTab} onValueChange={(v) => setSearchParams({ tab: v })}>
                <TabsList className="bg-secondary/50 border border-border p-1 mb-8 w-full justify-start overflow-x-auto flex-nowrap">
                    <TabsTrigger value="wallet" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Wallet</TabsTrigger>
                    <TabsTrigger value="links" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">My Links</TabsTrigger>
                    <TabsTrigger value="batch" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Batch Payments</TabsTrigger>
                    <TabsTrigger value="receipts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Receipts</TabsTrigger>
                </TabsList>

                {/* WALLET TAB */}
                <TabsContent value="wallet" className="animate-in fade-in-50 zoom-in-95">
                    <WalletTab />
                </TabsContent>

                {/* LINKS TAB */}
                <TabsContent value="links" className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold">Your Payment Links</h2>

                        <Dialog open={isLinkCreateOpen} onOpenChange={(open) => { setIsLinkCreateOpen(open); if (!open) resetLinkForm(); }}>
                            <DialogTrigger asChild>
                                <Button className="gap-2"><Plus size={16} /> New Payment Link</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Create Payment Link</DialogTitle>
                                </DialogHeader>

                                {createdLinks.length > 0 ? (
                                    /* ── SUCCESS STATE ── */
                                    <div className="space-y-4 py-4">
                                        <p className="text-sm text-muted-foreground text-center font-medium">
                                            {createdLinks.length === 1 ? 'Your payment link is ready!' : `${createdLinks.length} split links created!`}
                                        </p>

                                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                            {createdLinks.map((link) => {
                                                const url = `${appUrl}/pay?link=${link.id}`;
                                                const isCopied = copiedLinkIds.has(link.id);
                                                return (
                                                    <div key={link.id} className="border border-border rounded-xl p-3 space-y-2 bg-secondary/40">
                                                        {createdLinks.length > 1 && (
                                                            <p className="text-xs font-semibold text-primary">{link.amount.toFixed(2)} USDC</p>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                            <code className="flex-1 text-xs font-mono break-all text-foreground bg-background/60 rounded-lg px-2 py-1.5 border border-border">
                                                                {url}
                                                            </code>
                                                            <button
                                                                onClick={() => handleCopyLink(link.id, url)}
                                                                className="shrink-0 p-2 rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
                                                                title="Copy"
                                                            >
                                                                {isCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                                            </button>
                                                        </div>
                                                        {/* Social sharing */}
                                                        <div className="flex gap-2 pt-1">
                                                            <a
                                                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Pay me ${link.amount} USDC on Qevor ⚡`)}&url=${encodeURIComponent(url)}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                                                X
                                                            </a>
                                                            <a
                                                                href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Pay me ${link.amount} USDC on Qevor ⚡`)}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                                                Telegram
                                                            </a>
                                                            <a
                                                                href={`https://wa.me/?text=${encodeURIComponent(`Pay me ${link.amount} USDC on Qevor ⚡ ${url}`)}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                                                WhatsApp
                                                            </a>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="flex gap-3 pt-2 border-t border-border">
                                            <Button variant="outline" className="flex-1" onClick={resetLinkForm}>Create Another</Button>
                                            <Button className="flex-1 gradient-primary" onClick={() => { setIsLinkCreateOpen(false); resetLinkForm(); }}>Done</Button>
                                        </div>
                                    </div>
                                ) : (
                                    /* ── FORM STATE ── */
                                    <div className="space-y-4 py-4">
                                        {/* Recipient */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Recipient (username or 0x…)</label>
                                            <input
                                                value={linkRecipient}
                                                onChange={e => setLinkRecipient(e.target.value)}
                                                placeholder="@satoshi or 0x..."
                                                className="w-full bg-secondary border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                                            />
                                        </div>

                                        {/* Single amount (hidden in split mode) */}
                                        {!linkSplitMode && (
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
                                        )}

                                        {/* Split Mode toggle */}
                                        <SplitInput onSplitChange={(amounts, isActive) => {
                                            setLinkSplitMode(isActive);
                                            setLinkSplitAmounts(amounts);
                                        }} />

                                        {/* Expiry + Max Uses */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium flex items-center gap-2">
                                                Expiration Date (optional)
                                                {linkSplitMode && linkSplitAmounts.length > 0 && (
                                                    <span className="text-xs text-primary font-normal">applies to all {linkSplitAmounts.length} links</span>
                                                )}
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={linkExpiresAt}
                                                onChange={e => setLinkExpiresAt(e.target.value)}
                                                className="w-full bg-secondary border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                            />
                                        </div>

                                        <div className="space-y-2 border border-border rounded-xl p-3 bg-secondary/40">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium flex items-center gap-2">
                                                    Max Uses per Link
                                                    {linkSplitMode && linkSplitAmounts.length > 0 && (
                                                        <span className="text-xs text-primary font-normal">applies to all {linkSplitAmounts.length} links</span>
                                                    )}
                                                </label>
                                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={linkUnlimitedUses}
                                                        onChange={e => { setLinkUnlimitedUses(e.target.checked); if (e.target.checked) setLinkMaxUses(''); }}
                                                        className="accent-primary"
                                                    />
                                                    Unlimited
                                                </label>
                                            </div>
                                            {!linkUnlimitedUses && (
                                                <input
                                                    type="number"
                                                    value={linkMaxUses}
                                                    onChange={e => setLinkMaxUses(e.target.value)}
                                                    placeholder="e.g. 5"
                                                    min="1"
                                                    className="w-full bg-secondary border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                />
                                            )}
                                        </div>

                                        <div className="flex justify-end gap-3 pt-2 border-t border-border">
                                            <Button variant="ghost" onClick={() => setIsLinkCreateOpen(false)}>Cancel</Button>
                                            <Button
                                                onClick={handleCreateLink}
                                                disabled={linkCreating || !linkRecipient || (linkSplitMode ? linkSplitAmounts.length === 0 : !linkAmount)}
                                                className="gap-2"
                                            >
                                                {linkCreating ? <Loader2 className="animate-spin w-4 h-4" /> : <Link2 size={14} />}
                                                {linkSplitMode ? `Generate ${linkSplitAmounts.length || 0} Links` : 'Generate Link'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>

                    {/* Stats bar */}
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

                {/* BATCH PAYMENTS TAB */}
                <TabsContent value="batch" className="space-y-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold">Your Batch Payments</h2>
                        <Dialog
                            open={isCreateOpen}
                            onOpenChange={(open) => {
                                if (batchSendStep === 'sending') return; // block close while sending
                                setIsCreateOpen(open);
                                if (!open) resetBatchForm();
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus size={16} /> New Batch Payment
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>
                                        {batchSendStep === 'form' && 'Send Batch Payment'}
                                        {batchSendStep === 'sending' && 'Sending…'}
                                        {batchSendStep === 'done' && 'Batch Complete'}
                                    </DialogTitle>
                                </DialogHeader>

                                {/* ── FORM ── */}
                                {batchSendStep === 'form' && (
                                    <>
                                        <div className="space-y-4 py-4">
                                            <div>
                                                <label className="text-sm font-medium mb-1 block">Title (optional)</label>
                                                <input
                                                    value={batchTitle}
                                                    onChange={e => setBatchTitle(e.target.value)}
                                                    className="w-full bg-secondary border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                                                    placeholder="Team salaries, Q3 bonuses…"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                                                <textarea
                                                    value={batchDesc}
                                                    onChange={e => setBatchDesc(e.target.value)}
                                                    className="w-full bg-secondary border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary min-h-[72px]"
                                                    placeholder="Payment for Q3 milestones…"
                                                />
                                            </div>

                                            <div className="space-y-3 pt-4 border-t border-border">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-medium">Recipients</h4>
                                                    <p className="text-xs text-muted-foreground">Wallet or @username · USDC amount</p>
                                                </div>
                                                {batchRecipients.map((rec, i) => (
                                                    <div key={i} className="flex gap-2 items-start">
                                                        <input
                                                            value={rec.wallet}
                                                            onChange={e => {
                                                                const newR = [...batchRecipients];
                                                                newR[i].wallet = e.target.value;
                                                                setBatchRecipients(newR);
                                                            }}
                                                            placeholder="0x… or @username"
                                                            className="flex-1 bg-secondary border border-border rounded-lg p-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                        <input
                                                            type="number"
                                                            value={rec.amount || ''}
                                                            onChange={e => {
                                                                const newR = [...batchRecipients];
                                                                newR[i].amount = Number(e.target.value);
                                                                setBatchRecipients(newR);
                                                            }}
                                                            placeholder="USDC"
                                                            min="0"
                                                            step="0.01"
                                                            className="w-24 bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                        <input
                                                            value={rec.label || ''}
                                                            onChange={e => {
                                                                const newR = [...batchRecipients];
                                                                newR[i].label = e.target.value;
                                                                setBatchRecipients(newR);
                                                            }}
                                                            placeholder="Label"
                                                            className="w-28 bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                        {batchRecipients.length > 1 && (
                                                            <Button
                                                                variant="ghost"
                                                                className="text-destructive px-2 shrink-0"
                                                                onClick={() => setBatchRecipients(batchRecipients.filter((_, idx) => idx !== i))}
                                                            >
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

                                            {/* Total summary */}
                                            {batchRecipients.some(r => r.amount > 0) && (
                                                <div className="flex justify-between items-center bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                                                    <span className="text-sm text-muted-foreground">Total to send</span>
                                                    <span className="font-bold text-primary">
                                                        {batchRecipients.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2)} USDC
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                            <Button variant="ghost" onClick={() => { setIsCreateOpen(false); resetBatchForm(); }}>Cancel</Button>
                                            <Button
                                                onClick={handleSendBatch}
                                                disabled={batchLoading || !batchRecipients.some(r => r.wallet && r.amount > 0)}
                                                className="gap-2"
                                            >
                                                {batchLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Users size={16} />}
                                                Send to {batchRecipients.filter(r => r.wallet && r.amount > 0).length} Recipient{batchRecipients.filter(r => r.wallet && r.amount > 0).length !== 1 ? 's' : ''}
                                            </Button>
                                        </div>
                                    </>
                                )}

                                {/* ── SENDING ── */}
                                {batchSendStep === 'sending' && (
                                    <div className="py-6 space-y-6">
                                        <div className="text-center space-y-2">
                                            <Loader2 className="animate-spin text-primary w-10 h-10 mx-auto" />
                                            <p className="text-sm text-muted-foreground">
                                                Confirm payment <span className="font-semibold text-foreground">{batchSendProgress.current}</span> of <span className="font-semibold text-foreground">{batchSendProgress.total}</span> in your wallet
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            {batchRecipients.filter(r => r.wallet && r.amount > 0).map((r, i) => {
                                                const done = i < batchSendProgress.current - 1;
                                                const active = i === batchSendProgress.current - 1;
                                                return (
                                                    <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${active ? 'border-primary/40 bg-primary/5' : done ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-secondary/30 opacity-50'}`}>
                                                        <div className="flex items-center gap-3">
                                                            {done
                                                                ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                                                                : active
                                                                    ? <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                                                                    : <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
                                                            }
                                                            <span className="font-mono text-xs">{r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}</span>
                                                            {r.label && <span className="text-xs text-muted-foreground">· {r.label}</span>}
                                                        </div>
                                                        <span className="text-sm font-semibold">{r.amount} USDC</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ── DONE ── */}
                                {batchSendStep === 'done' && (
                                    <div className="py-6 space-y-5">
                                        <div className="text-center space-y-1">
                                            {batchSendResults.every(r => r.success)
                                                ? <><CheckCircle2 className="text-green-400 w-10 h-10 mx-auto" /><p className="font-semibold text-green-400">All payments sent!</p></>
                                                : <><XCircle className="text-yellow-400 w-10 h-10 mx-auto" /><p className="font-semibold text-yellow-400">Partially completed</p></>
                                            }
                                        </div>
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {batchSendResults.map((r, i) => (
                                                <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${r.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                                    <div className="flex items-center gap-3">
                                                        {r.success
                                                            ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                                                            : <XCircle size={15} className="text-red-400 shrink-0" />
                                                        }
                                                        <div>
                                                            <p className="font-mono text-xs">{r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}</p>
                                                            {r.label && <p className="text-xs text-muted-foreground">{r.label}</p>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-semibold">{r.amount} USDC</p>
                                                        {r.txHash && (
                                                            <a
                                                                href={`https://testnet.arcscan.app/tx/${r.txHash}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-primary hover:underline flex items-center gap-1 justify-end"
                                                            >
                                                                <ExternalLink size={10} /> Explorer
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Button className="w-full" onClick={() => { setIsCreateOpen(false); resetBatchForm(); }}>
                                            Done
                                        </Button>
                                    </div>
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>

                    {batchLoading && batches.length === 0 ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
                    ) : batches.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">No batch payments found.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {batches.map((b) => (
                                <BatchPaymentCard key={b.id} batch={b} />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* RECEIPTS TAB */}
                <TabsContent value="receipts" className="space-y-6">
                    {loadingReceipts ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
                    ) : receipts.length === 0 && batchReceiptGroups.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">No receipts found.</div>
                    ) : (
                        <div className="space-y-4">
                            {/* Payment link receipts — INCOMING or OUTGOING */}
                            {receipts.map((r) => {
                                const isIncoming = r.receiver.toLowerCase() === address!.toLowerCase();
                                const shortTx = `${r.tx_hash.slice(0, 8)}...${r.tx_hash.slice(-6)}`;
                                return (
                                    <div key={r.id} className="glass-card p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-full shrink-0 ${isIncoming ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {isIncoming ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-semibold">{Number(r.amount).toFixed(2)} USDC</p>
                                                    <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${isIncoming ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                                                        {isIncoming ? 'INCOMING' : 'OUTGOING'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground font-mono mt-0.5">TX: {shortTx}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {new Date(r.created_at).toLocaleString()}
                                                </p>
                                                {r.memo && <p className="text-xs text-muted-foreground italic mt-0.5">"{r.memo}"</p>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:items-end gap-1 text-xs font-mono text-muted-foreground shrink-0">
                                            <span>From: {r.sender.slice(0, 6)}…{r.sender.slice(-4)}</span>
                                            <span>To: {r.receiver.slice(0, 6)}…{r.receiver.slice(-4)}</span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <a
                                                href={`/receipt/${r.id}`}
                                                className="px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex items-center gap-1.5 text-sm font-medium"
                                            >
                                                <ReceiptIcon size={13} /> Receipt
                                            </a>
                                            <a
                                                href={`https://testnet.arcscan.app/tx/${r.tx_hash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 rounded-lg bg-secondary hover:bg-muted transition-colors flex items-center gap-1.5 text-sm font-medium"
                                            >
                                                <ExternalLink size={13} /> Explorer
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Batch payment groups — OUTGOING */}
                            {batchReceiptGroups.map((grp) => (
                                <div key={grp.batchId} className="glass-card p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-full shrink-0 bg-orange-500/10 text-orange-400">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-semibold">{grp.totalAmount.toFixed(2)} USDC</p>
                                                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/30">
                                                    BATCH · OUTGOING
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {grp.count} payment{grp.count !== 1 ? 's' : ''} · TX: {grp.latestTxHash.slice(0, 8)}…{grp.latestTxHash.slice(-6)}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{new Date(grp.createdAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <a
                                            href={`/request/${grp.batchId}`}
                                            className="px-3 py-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors flex items-center gap-1.5 text-sm font-medium"
                                        >
                                            <Users size={13} /> View Batch Payments
                                        </a>
                                        <a
                                            href={`https://testnet.arcscan.app/tx/${grp.latestTxHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2 rounded-lg bg-secondary hover:bg-muted transition-colors flex items-center gap-1.5 text-sm font-medium"
                                        >
                                            <ExternalLink size={13} /> Explorer
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

            </Tabs>

        </div>
    );
}
