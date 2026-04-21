import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAccount, useConnect, useSendTransaction, usePublicClient } from 'wagmi';
import { parseUnits, parseGwei } from 'viem';
import { arcTestnet } from '@/lib/arcChain';
import { Loader2, Share2, Wallet, CheckCircle2, Copy } from 'lucide-react';
import Confetti from 'react-confetti';
import { toast } from 'sonner';
import { useBatchRequests, BatchRequest, BatchPayment } from '@/hooks/useBatchRequests';

export default function RequestPage() {
    const { id } = useParams<{ id: string }>();
    const [request, setRequest] = useState<BatchRequest | null>(null);
    const [payments, setPayments] = useState<BatchPayment[]>([]);
    const [isSuccess, setIsSuccess] = useState(false);

    // TX State
    const [isPaying, setIsPaying] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const { getBatchRequest, getBatchPayments, recordBatchPayment, updateBatchStatus, loading } = useBatchRequests();

    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const { sendTransactionAsync } = useSendTransaction();
    const publicClient = usePublicClient({ chainId: arcTestnet.id });

    const fetchData = async () => {
        if (!id) return;
        const req = await getBatchRequest(id);
        setRequest(req);
        if (req) {
            const pays = await getBatchPayments(id);
            setPayments(pays);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    if (loading || !request) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const myAllocation = address ? request.recipients.find(r => r.wallet.toLowerCase() === address.toLowerCase()) : undefined;
    const iHavePaid = address ? payments.some(p => p.payer_wallet.toLowerCase() === address.toLowerCase()) : false;
    const isOwner = address && request.creator_wallet.toLowerCase() === address.toLowerCase();

    const handlePayShare = async () => {
        if (!address || !myAllocation || !publicClient) return;

        try {
            setIsPaying(true);
            toast.loading('Confirm in your wallet...');

            const amountInUnits = parseUnits(myAllocation.amount.toString(), 18);

            const hash = await sendTransactionAsync({
                to: request.creator_wallet as `0x${string}`,
                value: amountInUnits,
                chain: arcTestnet,
                maxFeePerGas: parseGwei('160'),
                maxPriorityFeePerGas: parseGwei('160'),
            });

            setIsPaying(false);
            toast.dismiss();
            toast.loading('Payment confirming on blockchain...');
            setIsConfirming(true);

            const receipt = await publicClient.waitForTransactionReceipt({
                hash,
                confirmations: 1,
                timeout: 90000,
            });

            setIsConfirming(false);

            if (receipt.status === 'success') {
                toast.dismiss();
                toast.success('Share Paid successfully!');
                setIsSuccess(true);

                await recordBatchPayment(
                    request.id,
                    address,
                    request.creator_wallet,
                    myAllocation.amount,
                    hash
                );

                // Auto-evaluate status
                const newPays = await getBatchPayments(request.id);
                if (newPays.length === request.recipients.length) {
                    await updateBatchStatus(request.id, 'complete');
                } else {
                    await updateBatchStatus(request.id, 'partial');
                }

                fetchData();
            } else {
                throw new Error("Transaction reverted");
            }
        } catch (error: any) {
            setIsPaying(false);
            setIsConfirming(false);
            toast.dismiss();
            toast.error(error?.shortMessage || error?.message || 'Payment failed');
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative">
            {isSuccess && <Confetti recycle={false} numberOfPieces={400} />}

            <div className="w-full max-w-2xl glass-card rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-purple-400 to-primary/50" />

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">{request.title || 'Batch Payment Request'}</h1>
                        <p className="text-muted-foreground mt-2">{request.description}</p>
                    </div>
                    <div className="text-left sm:text-right">
                        <p className="text-sm text-muted-foreground">Total Requested</p>
                        <p className="text-2xl font-bold text-foreground">{request.total_amount.toFixed(2)} USDC</p>
                    </div>
                </div>

                <div className="bg-secondary/40 rounded-xl border border-border p-5 mb-8 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Creator</p>
                        <p className="font-mono text-sm">{shortAddr(request.creator_wallet)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Status</p>
                        <div className="inline-flex px-2 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20 capitalize">
                            {request.status}
                        </div>
                    </div>
                </div>

                <h3 className="text-lg font-semibold mb-4 border-b border-border pb-2">Recipients List</h3>
                <div className="space-y-3 mb-8">
                    {request.recipients.map((rec, i) => {
                        const hasPaid = payments.some(p => p.payer_wallet.toLowerCase() === rec.wallet.toLowerCase());
                        const isMe = address && rec.wallet.toLowerCase() === address.toLowerCase();

                        return (
                            <div
                                key={i}
                                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isMe ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20' : 'bg-card border-border'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full ${hasPaid ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-mono text-sm font-medium">{shortAddr(rec.wallet)}</p>
                                            {isMe && <span className="bg-primary px-1.5 py-0.5 rounded text-[10px] font-bold text-white uppercase">You</span>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{rec.label}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold">{rec.amount} USDC</p>
                                    <p className={`text-xs ${hasPaid ? 'text-green-400' : 'text-yellow-500'}`}>
                                        {hasPaid ? 'Paid' : 'Pending'}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {!isConnected ? (
                    <div className="bg-secondary p-5 rounded-xl border border-border text-center space-y-3">
                        <p className="text-sm text-muted-foreground">Do you have a share to pay? Connect your wallet to find out.</p>
                        <button
                            onClick={() => connect({ connector: connectors[0] })}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg px-6 py-2.5 transition-all shadow-glow"
                        >
                            Connect Wallet
                        </button>
                    </div>
                ) : myAllocation && !iHavePaid ? (
                    <div className="bg-primary/10 p-5 rounded-xl border border-primary/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-glow">
                        <div>
                            <p className="font-semibold text-primary">Your Share: {myAllocation.amount} USDC</p>
                            <p className="text-xs text-muted-foreground mt-1">Please fulfill your portion of the request.</p>
                        </div>
                        <button
                            onClick={handlePayShare}
                            disabled={isPaying || isConfirming}
                            className="w-full sm:w-auto bg-primary text-primary-foreground font-semibold rounded-lg px-8 py-3 transition-all hover:opacity-90 disabled:opacity-50"
                        >
                            {isPaying ? 'Confirm in Wallet...' : isConfirming ? 'Confirming...' : 'Pay My Share'}
                        </button>
                    </div>
                ) : myAllocation && iHavePaid ? (
                    <div className="bg-green-500/10 p-5 rounded-xl border border-green-500/30 text-center flex items-center justify-center gap-3">
                        <CheckCircle2 className="text-green-400" size={24} />
                        <p className="font-semibold text-green-400 text-lg">You've paid your share! Thank you.</p>
                    </div>
                ) : isOwner ? (
                    <div className="bg-secondary p-4 rounded-xl border border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">You created this request.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    toast.success('Link copied');
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded bg-primary/20 text-primary text-sm font-medium hover:bg-primary/30 transition-colors"
                            >
                                <Copy size={14} /> Copy Link
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-sm text-muted-foreground">
                        Your wallet ({shortAddr(address)}) is not on the recipients list for this batch request.
                    </div>
                )}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-8">
                Powered by <span className="gradient-text font-semibold">Qevor</span> on Arc Testnet
            </p>
        </div>
    );
}
