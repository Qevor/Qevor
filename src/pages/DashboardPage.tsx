import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { DynamicConnectButton } from '@dynamic-labs/sdk-react-core';
import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, LogIn, ExternalLink, Receipt as ReceiptIcon, Copy, Check, Link2, ArrowDownLeft, ArrowUpRight, Users, CheckCircle2, XCircle, Upload, Bot, ShieldCheck, AlertTriangle, UserRound, Sparkles } from 'lucide-react';
import { PaymentLinkCard } from '@/components/PaymentLinkCard';
import { BatchPaymentCard } from '@/components/BatchPaymentCard';
import { SplitInput } from '@/components/SplitInput';
import { supabase } from '@/integrations/supabase/client';
import { useBatchPayments, BatchRecipient, BatchPayment } from '@/hooks/useBatchPayments';
import { useProfiles } from '@/hooks/useProfiles';
import { usePaymentLinks } from '@/hooks/usePaymentLinks';
import { WalletTab } from '@/components/WalletTab';
import { useBatchSend } from '@/hooks/useBatchSend';
import { fetchAgentWallets } from '@/lib/agents/queries';
import type { AgentWallet } from '@/lib/agents/types';
import { reviewPaymentDraft } from '@/lib/agents/safety-review';
import { planPaymentIntent, type PaymentIntentPlan } from '@/lib/agents/intent-planner';
import { AgentWorkspace } from '@/components/agents/AgentWorkspace';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getAppUrl } from '@/lib/appUrl';
import { DEFAULT_QEVOR_CHAIN_KEY, getExplorerTxUrl, getQevorChainById, getQevorChainByKey, qevorChains, type QevorChainKey } from '@/lib/chains';

export default function DashboardPage() {
    const { address, isConnected } = useAccount();
    const [searchParams, setSearchParams] = useSearchParams();

    const defaultTab = searchParams.get('tab') || 'agent';

    const [links, setLinks] = useState<any[]>([]);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [batches, setBatches] = useState<any[]>([]);

    const [loadingLinks, setLoadingLinks] = useState(false);
    const [loadingReceipts, setLoadingReceipts] = useState(false);

    const { getBatchesByWallet, createBatch, getBatchPaymentsByWallet, recordBatchPayment, updateBatchStatus, loading: batchLoading } = useBatchPayments();
    const { sendBatch, isPending: isSendingBatch } = useBatchSend();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [batchTitle, setBatchTitle] = useState('');
    const [batchDesc, setBatchDesc] = useState('');
    const [batchRecipients, setBatchRecipients] = useState<BatchRecipient[]>([{ wallet: '', amount: 0, label: '' }]);
    const [batchChainKey, setBatchChainKey] = useState<QevorChainKey>(DEFAULT_QEVOR_CHAIN_KEY);
    const [copilotIntent, setCopilotIntent] = useState('');
    const [copilotPlan, setCopilotPlan] = useState<PaymentIntentPlan | null>(null);
    const [copilotPlanning, setCopilotPlanning] = useState(false);
    const selectedBatchNetwork = getQevorChainByKey(batchChainKey);

    type SendStep = 'form' | 'sending' | 'done' | 'queued';
    type SendResult = { wallet: string; amount: number; label?: string; txHash?: string; success: boolean };
    const [batchSendStep, setBatchSendStep] = useState<SendStep>('form');
    const [batchSendResults, setBatchSendResults] = useState<SendResult[]>([]);

    // Agent execution: list of usable agent wallets (escrow_address must be set),
    // and which one (if any) the user picked for this batch. null = manual (wagmi sign).
    const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
    const [executorAgentId, setExecutorAgentId] = useState<string | null>(null);
    const availableAgentWallets = agentWallets.filter((w) => w.chain === selectedBatchNetwork.agentChainCode);
    const batchSafetyReview = useMemo(() => reviewPaymentDraft(
        batchRecipients
            .filter((recipient) => recipient.wallet || recipient.amount > 0)
            .map((recipient) => `${recipient.wallet},${recipient.amount},${recipient.label || ''}`)
            .join('\n')
    ), [batchRecipients]);
    const copilotPolicyExceeded = !!copilotPlan?.constraints.maxAmount
        && batchSafetyReview.total > copilotPlan.constraints.maxAmount;
    const batchPaymentReady = batchSafetyReview.allowed && !copilotPolicyExceeded;

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
    const [linkChainKey, setLinkChainKey] = useState<QevorChainKey>(DEFAULT_QEVOR_CHAIN_KEY);
    const selectedLinkNetwork = getQevorChainByKey(linkChainKey);
    const [createdLinks, setCreatedLinks] = useState<Array<{ id: string; amount: number; token_symbol?: string }>>([]);
    const [copiedLinkIds, setCopiedLinkIds] = useState<Set<string>>(new Set());

    // Receipts — batch payment groups
    const [batchReceiptGroups, setBatchReceiptGroups] = useState<Array<{
        batchId: string;
        totalAmount: number;
        count: number;
        latestTxHash: string;
        createdAt: string;
        chainId?: number;
        tokenSymbol?: string;
    }>>([]);

    const appUrl = getAppUrl();

    useEffect(() => {
        if (address) {
            fetchLinks();
            fetchReceipts();
            fetchBatches();
            fetchBatchReceiptGroups();
            fetchAgentWallets(address)
              .then((all) => setAgentWallets(all.filter((w) => w.executor_mode === 'escrow' && !!w.escrow_address)))
              .catch(() => setAgentWallets([]));
        }
    }, [address]);

    useEffect(() => {
        if (!executorAgentId) return;
        const selectedAgent = agentWallets.find((w) => w.id === executorAgentId);
        if (selectedAgent && selectedAgent.chain !== selectedBatchNetwork.agentChainCode) {
            setExecutorAgentId(null);
        }
    }, [executorAgentId, agentWallets, selectedBatchNetwork.agentChainCode]);

    const fetchLinks = async () => {
        if (!address) return;
        setLoadingLinks(true);
        const { data, error } = await supabase
            .from('payment_links')
            .select('*')
            .or(`creator_wallet.ilike.${address},receiver_wallet.ilike.${address}`)
            .order('created_at', { ascending: false });
        if (error) {
            toast.error('Could not load payment links. Run the latest Supabase migration.');
            setLoadingLinks(false);
            return;
        }
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
        const groups: Record<string, { batchId: string; totalAmount: number; count: number; latestTxHash: string; createdAt: string; chainId?: number; tokenSymbol?: string }> = {};
        for (const p of payments) {
            if (!groups[p.batch_request_id]) {
                groups[p.batch_request_id] = { batchId: p.batch_request_id, totalAmount: 0, count: 0, latestTxHash: p.tx_hash, createdAt: p.created_at, chainId: p.chain_id, tokenSymbol: p.token_symbol };
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
            creator_wallet: address,
            receiver_wallet: finalWallet,
            amount: amt,
            chain_id: selectedLinkNetwork.chain.id,
            token_symbol: selectedLinkNetwork.paymentAsset,
            expires_at: expiresAtISO,
            max_uses: maxUsesVal,
            current_uses: 0,
            group_id: groupId,
        }));

        const data = await createLinks(linksPayload);
        if (data && data.length > 0) {
            setCreatedLinks(data.map((l: any) => ({ id: l.id, amount: l.amount, token_symbol: l.token_symbol ?? selectedLinkNetwork.paymentAsset })));
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
        setLinkChainKey(DEFAULT_QEVOR_CHAIN_KEY);
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
        setBatchChainKey(DEFAULT_QEVOR_CHAIN_KEY);
        setBatchSendStep('form');
        setBatchSendResults([]);
        setExecutorAgentId(null);
        setCopilotIntent('');
        setCopilotPlan(null);
        setCopilotPlanning(false);
    };

    // Called by a card's Send button — pre-fills the dialog with only the unsent recipients
    const handleSendUnsent = (unsentRecipients: BatchRecipient[]) => {
        resetBatchForm();
        if (unsentRecipients.length > 0) {
            setBatchRecipients(unsentRecipients);
        }
        setIsCreateOpen(true);
    };

    // Parse a CSV file into recipient rows.
    // Supported columns (with or without header row): address, amount[, label]
    const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = (ev.target?.result as string) || '';
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) return;

            const parsed: BatchRecipient[] = [];
            for (const line of lines) {
                const delimiter = line.includes(',') ? ',' : line.includes(';') ? ';' : '\t';
                const cols = line.split(delimiter).map(c => c.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));
                const addr = cols[0];
                const amt  = parseFloat(cols[1]);
                const lbl  = cols[2] || '';
                // Skip header row or invalid rows
                if (!addr.startsWith('0x') && !addr.startsWith('0X')) continue;
                if (isNaN(amt) || amt <= 0) continue;
                parsed.push({ wallet: addr, amount: amt, label: lbl });
            }

            if (parsed.length === 0) {
                toast.error('No valid rows found. Expected: address,amount[,label]');
                return;
            }
            setBatchRecipients(parsed);
            setCopilotPlan(null);
            toast.success(`Imported ${parsed.length} recipient${parsed.length !== 1 ? 's' : ''}`);
        };
        reader.readAsText(file);
        // Reset the input so the same file can be re-imported if needed
        e.target.value = '';
    };

    const handlePlanPaymentIntent = async () => {
        if (copilotIntent.trim().length < 3) {
            toast.error('Describe the payment you want Qevor to prepare.');
            return;
        }
        setCopilotPlanning(true);
        const plan = await planPaymentIntent(copilotIntent, {
            currentChainKey: batchChainKey,
            currentRecipients: batchRecipients,
            profileWallet: address,
        });
        setCopilotPlan(plan);
        setCopilotPlanning(false);
    };

    const applyCopilotPlan = () => {
        if (!copilotPlan) return;
        setBatchTitle(copilotPlan.title);
        setBatchDesc(copilotPlan.description);
        setBatchChainKey(copilotPlan.chainKey);
        if (copilotPlan.recipients.length > 0) {
            setBatchRecipients(copilotPlan.recipients);
        }

        const targetAgentChain = getQevorChainByKey(copilotPlan.chainKey).agentChainCode;
        const eligibleAgent = agentWallets.find((wallet) => wallet.chain === targetAgentChain);
        setExecutorAgentId(copilotPlan.executionMode === 'agent' && eligibleAgent ? eligibleAgent.id : null);
        toast.success('Copilot plan applied. Review the safety result before sending.');
    };

    const openCopilotPlanInBatch = () => {
        applyCopilotPlan();
        setSearchParams({ tab: 'batch' });
        setIsCreateOpen(true);
    };

    const handleSendBatch = async () => {
        if (!address) return;
        if (copilotPolicyExceeded) {
            toast.error(`The copilot policy blocks totals above ${copilotPlan?.constraints.maxAmount}.`);
            return;
        }
        if (!batchSafetyReview.allowed) {
            toast.error('The safety copilot blocked this batch. Fix the payment issues first.');
            return;
        }

        // Validate & resolve usernames to wallet addresses
        const resolvedRecipients: BatchRecipient[] = [];
        for (const r of batchRecipients) {
            if (!r.wallet || r.amount <= 0) continue;
            let finalWallet = r.wallet;
            if (!r.wallet.startsWith('0x') || r.wallet.length !== 42) {
                const resolved = await resolveUsernameToWallet(r.wallet);
                if (!resolved) {
                    toast.error(`Could not resolve: ${r.wallet}`);
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

        const totalAmount = resolvedRecipients.reduce((s, r) => s + Number(r.amount), 0);

        // Create the batch record in DB before sending - acts as the receipt container.
        // If this fails, do not open a wallet tx; otherwise Mantle receipts could be lost.
        let newBatch;
        try {
            newBatch = await createBatch({
                title:          batchTitle || undefined,
                description:    batchDesc  || undefined,
                creator_wallet: address,
                recipients:     resolvedRecipients,
                total_amount:   totalAmount,
                chain_id:       selectedBatchNetwork.chain.id,
                token_symbol:   selectedBatchNetwork.paymentAsset,
                expires_at:     null,
                executor_agent_wallet_id: executorAgentId ?? undefined,
            });
        } catch (err: any) {
            const message = String(err?.message || err?.details || err?.hint || err || '');
            const schemaMissing = /chain_id|token_symbol|schema cache|column/i.test(message);
            toast.error(
                schemaMissing
                    ? 'Supabase needs the multichain migration before Mantle batch sends. Run migration 03_multichain_mantle.sql.'
                    : `Failed to initialise batch payment: ${message || 'database insert failed'}`
            );
            return;
        }

        if (!newBatch) {
            toast.error('Failed to initialise batch payment');
            return;
        }

        // Agent-executed branch: the executor service on the VPS will pick this up,
        // evaluate it against the policy, and submit transfers via Circle. The user
        // does not sign anything. Show a queued state and exit.
        if (executorAgentId) {
            setBatchSendStep('queued');
            fetchBatches();
            return;
        }

        setBatchSendStep('sending');

        try {
            // ONE transaction → ONE wallet confirmation → distributes to all recipients
            const { txHash } = await sendBatch(
                resolvedRecipients.map(r => ({ wallet: r.wallet as `0x${string}`, amount: r.amount })),
                batchChainKey,
            );

            // Record each recipient's payment against the same txHash
            await Promise.all(
                resolvedRecipients.map(r =>
                    recordBatchPayment(newBatch.id, address, r.wallet, r.amount, txHash, selectedBatchNetwork.chain.id, selectedBatchNetwork.paymentAsset)
                )
            );

            await updateBatchStatus(newBatch.id, 'complete');

            setBatchSendResults(resolvedRecipients.map(r => ({ ...r, txHash, success: true })));
            setBatchSendStep('done');
            fetchBatches();
        } catch (err: any) {
            // Roll back the pending DB record so the user can retry
            await updateBatchStatus(newBatch.id, 'pending');
            setBatchSendStep('form');
            toast.error(err?.shortMessage || err?.message || 'Batch payment failed');
        }
    };

    if (!isConnected) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
                <div className="glass-card p-10 rounded-2xl text-center max-w-lg space-y-6">
                    <div className="bg-primary/20 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                        <LogIn className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold">Connect to command Qevor</h2>
                    <p className="text-muted-foreground">
                        Connect your wallet to plan agent operations, enforce payment policy, and approve execution.
                    </p>
                    <DynamicConnectButton
                        buttonContainerClassName="w-full"
                        buttonClassName="w-full gradient-primary shadow-glow hover:shadow-glow-lg h-12 inline-flex items-center justify-center rounded-md px-8 text-sm font-medium text-primary-foreground"
                    >
                        Connect wallet
                    </DynamicConnectButton>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <Tabs value={defaultTab} onValueChange={(v) => setSearchParams({ tab: v })}>
                <TabsList className="bg-secondary/50 border border-border p-1 mb-8 w-full justify-start overflow-x-auto flex-nowrap">
                    <TabsTrigger value="agent" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">
                        <Bot className="mr-2 h-4 w-4" /> Agent Workspace
                    </TabsTrigger>
                    <TabsTrigger value="wallet" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Wallet</TabsTrigger>
                    <TabsTrigger value="links" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">My Links</TabsTrigger>
                    <TabsTrigger value="batch" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Batch Payments</TabsTrigger>
                    <TabsTrigger value="receipts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-w-max">Receipts</TabsTrigger>
                </TabsList>

                <TabsContent value="agent" className="animate-in fade-in-50">
                    <AgentWorkspace
                        intent={copilotIntent}
                        plan={copilotPlan}
                        planning={copilotPlanning}
                        agentWalletCount={agentWallets.length}
                        importedRecipientCount={batchRecipients.filter((recipient) => recipient.wallet && recipient.amount > 0).length}
                        onIntentChange={setCopilotIntent}
                        onCsvImport={handleCsvImport}
                        onPlan={handlePlanPaymentIntent}
                        onOpenPlan={openCopilotPlanInBatch}
                    />
                </TabsContent>

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
                                                            <p className="text-xs font-semibold text-primary">{link.amount.toFixed(2)} {link.token_symbol ?? selectedLinkNetwork.paymentAsset}</p>
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
                                                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Pay me ${link.amount} ${link.token_symbol ?? selectedLinkNetwork.paymentAsset} on Qevor`)}&url=${encodeURIComponent(url)}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                                                X
                                                            </a>
                                                            <a
                                                                href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Pay me ${link.amount} ${link.token_symbol ?? selectedLinkNetwork.paymentAsset} on Qevor`)}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                                                Telegram
                                                            </a>
                                                            <a
                                                                href={`https://wa.me/?text=${encodeURIComponent(`Pay me ${link.amount} ${link.token_symbol ?? selectedLinkNetwork.paymentAsset} on Qevor ${url}`)}`}
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
                                                <label className="text-sm font-medium">Amount ({selectedLinkNetwork.paymentAsset})</label>
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

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Network</label>
                                            <select
                                                value={linkChainKey}
                                                onChange={(e) => setLinkChainKey(e.target.value as QevorChainKey)}
                                                className="w-full bg-secondary border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                            >
                                                {qevorChains.map(network => (
                                                    <option key={network.key} value={network.key}>
                                                        {network.label} ({network.paymentAsset})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

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
                                {links.reduce((acc, curr) => acc + Number(curr.amount), 0).toFixed(2)} multi-chain
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
                                if (batchSendStep === 'sending') return; // block dismiss while tx is in-flight
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
                                        {batchSendStep === 'form'    && 'Send Batch Payment'}
                                        {batchSendStep === 'sending' && 'Waiting for confirmation…'}
                                        {batchSendStep === 'done'    && 'Batch Payment Complete'}
                                        {batchSendStep === 'queued'  && 'Queued for Agent Executor'}
                                    </DialogTitle>
                                </DialogHeader>

                                {/* ── FORM ── */}
                                {batchSendStep === 'form' && (
                                    <>
                                        <div className="space-y-4 py-4">
                                            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 text-sm font-semibold">
                                                            <Sparkles className="h-4 w-4 text-primary" />
                                                            Qevor Copilot
                                                        </div>
                                                        <p className="mt-1 text-xs text-muted-foreground">Describe a payout. Copilot prepares a draft; it cannot move funds or bypass safety policy.</p>
                                                    </div>
                                                    <span className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">Human approval</span>
                                                </div>
                                                <textarea
                                                    value={copilotIntent}
                                                    onChange={(event) => setCopilotIntent(event.target.value)}
                                                    rows={3}
                                                    className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                    placeholder="Pay 5 MNT to the recipient address on Mantle and require my approval."
                                                />
                                                <div className="flex justify-end">
                                                    <Button type="button" size="sm" className="gap-2" onClick={handlePlanPaymentIntent} disabled={copilotPlanning}>
                                                        {copilotPlanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                                        Build payment plan
                                                    </Button>
                                                </div>

                                                {copilotPlan && (
                                                    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-sm font-semibold">{copilotPlan.title}</span>
                                                            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                                                                {copilotPlan.source === 'openai' ? 'AI plan' : 'Local plan'}
                                                            </span>
                                                            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                                                                {getQevorChainByKey(copilotPlan.chainKey).label}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">{copilotPlan.explanation}</p>
                                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                                            <div><span className="block text-muted-foreground">Recipients</span><strong>{copilotPlan.recipients.length}</strong></div>
                                                            <div><span className="block text-muted-foreground">Execution</span><strong>{copilotPlan.executionMode === 'agent' ? 'Agent requested' : 'Human'}</strong></div>
                                                            <div><span className="block text-muted-foreground">Approval</span><strong>Required</strong></div>
                                                        </div>
                                                        {copilotPlan.executionLayer && (
                                                            <div className={`rounded-lg border px-3 py-2 text-xs ${
                                                                copilotPlan.executionLayer.configured && copilotPlan.executionLayer.allowed
                                                                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500'
                                                                    : copilotPlan.executionLayer.configured
                                                                        ? 'border-destructive/30 bg-destructive/5 text-destructive'
                                                                        : 'border-amber-500/30 bg-amber-500/5 text-amber-500'
                                                            }`}>
                                                                <div className="flex flex-wrap items-center gap-2 font-medium">
                                                                    <Bot className="h-3.5 w-3.5" />
                                                                    Byreal execution layer
                                                                    <span className="rounded bg-background/80 px-1.5 py-0.5 uppercase">
                                                                        {copilotPlan.executionLayer.configured
                                                                            ? copilotPlan.executionLayer.allowed ? 'preflight passed' : 'blocked'
                                                                            : 'not configured'}
                                                                    </span>
                                                                </div>
                                                                {copilotPlan.executionLayer.reason && (
                                                                    <p className="mt-1 text-muted-foreground">{copilotPlan.executionLayer.reason}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                        {copilotPlan.warnings.map((warning, index) => (
                                                            <p key={index} className="flex items-start gap-2 text-xs text-amber-500">
                                                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warning}
                                                            </p>
                                                        ))}
                                                        <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={applyCopilotPlan}>
                                                            <Check className="h-4 w-4" /> Apply plan to payment form
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-sm font-medium mb-1 block">Title (optional)</label>
                                                    <input
                                                        value={batchTitle}
                                                        onChange={e => setBatchTitle(e.target.value)}
                                                        className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                        placeholder="Team salaries, Q3 bonuses…"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                                                    <input
                                                        value={batchDesc}
                                                        onChange={e => setBatchDesc(e.target.value)}
                                                        className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                        placeholder="Q3 milestone payments…"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Network</label>
                                                <select
                                                    value={batchChainKey}
                                                    onChange={(e) => setBatchChainKey(e.target.value as QevorChainKey)}
                                                    className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    {qevorChains.map(network => (
                                                        <option key={network.key} value={network.key}>
                                                            {network.label} ({network.paymentAsset})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-3 pt-3 border-t border-border">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <label className="text-sm font-medium block">Execution</label>
                                                        <p className="text-xs text-muted-foreground mt-1">The safety copilot reviews both modes before funds move.</p>
                                                    </div>
                                                    <ShieldCheck className="h-5 w-5 text-primary" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExecutorAgentId(null)}
                                                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${!executorAgentId ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                                    >
                                                        <UserRound className="h-4 w-4" />
                                                        Human approval
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={availableAgentWallets.length === 0}
                                                        onClick={() => setExecutorAgentId(availableAgentWallets[0]?.id ?? null)}
                                                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${executorAgentId ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                                    >
                                                        <Bot className="h-4 w-4" />
                                                        Agent execution
                                                    </button>
                                                </div>
                                                {availableAgentWallets.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        Agent execution is not configured for {selectedBatchNetwork.label}.{' '}
                                                        <Link to="/agents" className="font-medium text-primary hover:underline">Set up an agent wallet</Link>
                                                    </p>
                                                ) : executorAgentId ? (
                                                    <p className="text-xs text-muted-foreground">The agent applies its policy and submits approved transfers automatically. You will not sign this batch.</p>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">You review the copilot result, then sign the batch in your connected wallet.</p>
                                                )}
                                            </div>

                                            {availableAgentWallets.length > 0 && executorAgentId && (
                                                <div className="space-y-2 pt-2 border-t border-border">
                                                    <label className="text-sm font-medium block">Execute with</label>
                                                    <select
                                                        value={executorAgentId ?? ''}
                                                        onChange={(e) => setExecutorAgentId(e.target.value || null)}
                                                        className="w-full bg-secondary border border-border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                    >
                                                        <option value="">Send manually (I sign in my wallet)</option>
                                                        {availableAgentWallets.map((w) => (
                                                            <option key={w.id} value={w.id}>
                                                                Agent: {w.label || `${w.wallet_address.slice(0, 6)}…${w.wallet_address.slice(-4)}`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {executorAgentId && (
                                                        <p className="text-xs text-muted-foreground">
                                                            The executor will evaluate this batch against the agent's policy and submit transfers automatically. You won't sign anything.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            <div className="space-y-3 pt-2 border-t border-border">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-medium text-sm">Recipients</h4>
                                                    {/* CSV Import */}
                                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-primary/50">
                                                        <Upload size={12} />
                                                        Import CSV
                                                        <input
                                                            type="file"
                                                            accept=".csv,text/csv"
                                                            className="hidden"
                                                            onChange={handleCsvImport}
                                                        />
                                                    </label>
                                                </div>

                                                {/* Column headers */}
                                                <div className="grid grid-cols-[1fr_5rem_6rem_1.5rem] gap-2 px-1">
                                                    <span className="text-xs text-muted-foreground">Wallet address or @username</span>
                                                    <span className="text-xs text-muted-foreground">{selectedBatchNetwork.paymentAsset}</span>
                                                    <span className="text-xs text-muted-foreground">Label</span>
                                                    <span />
                                                </div>

                                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                    {batchRecipients.map((rec, i) => (
                                                        <div key={i} className="grid grid-cols-[1fr_5rem_6rem_1.5rem] gap-2 items-center">
                                                            <input
                                                                value={rec.wallet}
                                                                onChange={e => {
                                                                    const newR = [...batchRecipients];
                                                                    newR[i].wallet = e.target.value;
                                                                    setBatchRecipients(newR);
                                                                }}
                                                                placeholder="0x…"
                                                                className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary w-full"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={rec.amount || ''}
                                                                onChange={e => {
                                                                    const newR = [...batchRecipients];
                                                                    newR[i].amount = Number(e.target.value);
                                                                    setBatchRecipients(newR);
                                                                }}
                                                                placeholder="0.00"
                                                                min="0"
                                                                step="0.01"
                                                                className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary w-full"
                                                            />
                                                            <input
                                                                value={rec.label || ''}
                                                                onChange={e => {
                                                                    const newR = [...batchRecipients];
                                                                    newR[i].label = e.target.value;
                                                                    setBatchRecipients(newR);
                                                                }}
                                                                placeholder="e.g. Alice"
                                                                className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary w-full"
                                                            />
                                                            <button
                                                                onClick={() => setBatchRecipients(batchRecipients.filter((_, idx) => idx !== i))}
                                                                className="text-muted-foreground hover:text-destructive transition-colors text-base leading-none"
                                                                disabled={batchRecipients.length === 1}
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full border-dashed text-xs"
                                                    onClick={() => setBatchRecipients([...batchRecipients, { wallet: '', amount: 0, label: '' }])}
                                                >
                                                    <Plus size={12} className="mr-1" /> Add Row
                                                </Button>
                                            </div>

                                            {/* Summary bar */}
                                            {batchRecipients.some(r => r.amount > 0) && (() => {
                                                const valid = batchRecipients.filter(r => r.wallet && r.amount > 0);
                                                const total = valid.reduce((s, r) => s + Number(r.amount), 0);
                                                return (
                                                    <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm">
                                                        <span className="text-muted-foreground">{valid.length} recipient{valid.length !== 1 ? 's' : ''} · 1 transaction · 1 gas fee</span>
                                                        <span className="font-bold text-primary">{total.toFixed(2)} {selectedBatchNetwork.paymentAsset}</span>
                                                    </div>
                                                );
                                            })()}

                                            {batchRecipients.some(r => r.wallet || r.amount > 0) && (
                                                <div className={`rounded-lg border px-4 py-3 ${batchPaymentReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                                                    <div className="flex items-center gap-2 text-sm font-medium">
                                                        {batchPaymentReady ? (
                                                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                                        ) : (
                                                            <AlertTriangle className="h-4 w-4 text-destructive" />
                                                        )}
                                                        Safety copilot: {batchPaymentReady ? 'Ready to proceed' : 'Action required'}
                                                    </div>
                                                    {batchSafetyReview.issues.length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            {batchSafetyReview.issues.slice(0, 4).map((issue, index) => (
                                                                <p key={`${issue.line}-${index}`} className={`text-xs ${issue.severity === 'block' ? 'text-destructive' : 'text-amber-500'}`}>
                                                                    Row {issue.line}: {issue.message}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {copilotPolicyExceeded && (
                                                        <p className="mt-2 text-xs text-destructive">
                                                            Copilot policy blocked this batch: total exceeds the {copilotPlan?.constraints.maxAmount} {selectedBatchNetwork.paymentAsset} limit.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            <p className="text-xs text-muted-foreground text-center">
                                                CSV format: <code className="bg-secondary px-1 rounded">address,amount,label</code> (label optional)
                                            </p>
                                        </div>

                                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                            <Button variant="ghost" onClick={() => { setIsCreateOpen(false); resetBatchForm(); }}>
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={handleSendBatch}
                                                disabled={isSendingBatch || batchLoading || !batchPaymentReady}
                                                className="gap-2"
                                            >
                                                {isSendingBatch || batchLoading
                                                    ? <Loader2 className="animate-spin w-4 h-4" />
                                                    : <Users size={15} />
                                                }
                                                {executorAgentId ? 'Queue for Agent' : 'Send Batch'}
                                            </Button>
                                        </div>
                                    </>
                                )}

                                {/* ── SENDING — waiting for single wallet confirmation ── */}
                                {batchSendStep === 'sending' && (
                                    <div className="py-8 space-y-6">
                                        <div className="text-center space-y-3">
                                            <div className="relative w-16 h-16 mx-auto">
                                                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                                                <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                                                    <Loader2 className="animate-spin text-primary w-7 h-7" />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground">Confirm in your wallet</p>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    One signature distributes {selectedBatchNetwork.paymentAsset} on {selectedBatchNetwork.label} to all {batchRecipients.filter(r => r.wallet && r.amount > 0).length} recipients
                                                </p>
                                            </div>
                                        </div>

                                        {/* All recipients shown as "pending" */}
                                        <div className="space-y-2 max-h-52 overflow-y-auto">
                                            {batchRecipients.filter(r => r.wallet && r.amount > 0).map((r, i) => (
                                                <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-secondary/30">
                                                    <div className="flex items-center gap-2.5">
                                                        <Loader2 size={13} className="animate-spin text-primary/60 shrink-0" />
                                                        <span className="font-mono text-xs text-muted-foreground">{r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}</span>
                                                        {r.label && <span className="text-xs text-muted-foreground">· {r.label}</span>}
                                                    </div>
                                                    <span className="text-xs font-semibold">{Number(r.amount).toFixed(2)} {selectedBatchNetwork.paymentAsset}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── DONE ── */}
                                {batchSendStep === 'done' && (() => {
                                    const txHash = batchSendResults[0]?.txHash;
                                    const total  = batchSendResults.reduce((s, r) => s + r.amount, 0);
                                    return (
                                        <div className="py-6 space-y-5">
                                            <div className="text-center space-y-2">
                                                <CheckCircle2 className="text-green-400 w-12 h-12 mx-auto" />
                                                <p className="font-bold text-lg text-green-400">Batch payment sent!</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {batchSendResults.length} recipients received a total of <span className="font-semibold text-foreground">{total.toFixed(2)} {selectedBatchNetwork.paymentAsset}</span>
                                                </p>
                                            </div>

                                            {/* Recipient summary */}
                                            <div className="space-y-2 max-h-52 overflow-y-auto">
                                                {batchSendResults.map((r, i) => (
                                                    <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-green-500/20 bg-green-500/5">
                                                        <div className="flex items-center gap-2.5">
                                                            <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                                                            <span className="font-mono text-xs">{r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}</span>
                                                            {r.label && <span className="text-xs text-muted-foreground">· {r.label}</span>}
                                                        </div>
                                                        <span className="text-xs font-semibold">{Number(r.amount).toFixed(2)} {selectedBatchNetwork.paymentAsset}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Single transaction link */}
                                            {txHash && (
                                                <a
                                                    href={getExplorerTxUrl(selectedBatchNetwork.chain.id, txHash)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border bg-secondary hover:bg-muted transition-colors text-sm font-medium"
                                                >
                                                    <ExternalLink size={14} /> View on Explorer
                                                </a>
                                            )}

                                            <Button className="w-full gradient-primary" onClick={() => { setIsCreateOpen(false); resetBatchForm(); }}>
                                                Done
                                            </Button>
                                        </div>
                                    );
                                })()}

                                {/* ── QUEUED FOR EXECUTOR ── */}
                                {batchSendStep === 'queued' && (
                                    <div className="py-8 space-y-5 text-center">
                                        <div className="relative w-16 h-16 mx-auto">
                                            <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                                            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                                                <Users className="text-primary w-7 h-7" />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground">Queued for the agent executor</p>
                                            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                                                The executor polls every 15 seconds. It will evaluate this batch against the policy on
                                                {' '}<span className="font-mono">{availableAgentWallets.find(w => w.id === executorAgentId)?.label || 'your agent wallet'}</span>{' '}
                                                and submit transfers when approved. Watch the Receipts tab or the agent's audit log to see results.
                                            </p>
                                        </div>
                                        <Button className="w-full gradient-primary" onClick={() => { setIsCreateOpen(false); resetBatchForm(); }}>
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
                                <BatchPaymentCard key={b.id} batch={b} onSend={handleSendUnsent} />
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
                                                    <p className="font-semibold">{Number(r.amount).toFixed(2)} {r.token_symbol ?? getQevorChainById(r.chain_id).paymentAsset}</p>
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
                                                href={getExplorerTxUrl(r.chain_id, r.tx_hash)}
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
                                                <p className="font-semibold">{grp.totalAmount.toFixed(2)} {grp.tokenSymbol ?? getQevorChainById(grp.chainId).paymentAsset}</p>
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
                                            href={getExplorerTxUrl(grp.chainId, grp.latestTxHash)}
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
