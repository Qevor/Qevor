import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { useBatchPayments, Batch, BatchPayment } from '@/hooks/useBatchPayments';
import { getExplorerTxUrl, getQevorChainById } from '@/lib/chains';

export default function RequestPage() {
    const { id } = useParams<{ id: string }>();
    const [batch, setBatch] = useState<Batch | null>(null);
    const [payments, setPayments] = useState<BatchPayment[]>([]);

    const { getBatch, getBatchPayments, loading } = useBatchPayments();

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            const b = await getBatch(id);
            setBatch(b);
            if (b) {
                const pays = await getBatchPayments(id);
                setPayments(pays);
            }
        };
        fetchData();
    }, [id]);

    if (loading || !batch) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

    const statusColors = {
        pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        partial: 'bg-primary/10 text-primary border-primary/20',
        complete: 'bg-green-500/10 text-green-400 border-green-500/20',
    };

    const paidCount = payments.length;
    const network = getQevorChainById(batch.chain_id);
    const tokenSymbol = batch.token_symbol ?? network.paymentAsset;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
            <div className="w-full max-w-2xl glass-card rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-purple-400 to-primary/50" />

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">{batch.title || 'Batch Payment'}</h1>
                        {batch.description && <p className="text-muted-foreground mt-1">{batch.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(batch.created_at).toLocaleString()}</p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                        <p className="text-sm text-muted-foreground">Total Sent</p>
                        <p className="text-2xl font-bold text-foreground">{batch.total_amount.toFixed(2)} {tokenSymbol}</p>
                    </div>
                </div>

                {/* Meta */}
                <div className="bg-secondary/40 rounded-xl border border-border p-4 mb-8 flex flex-wrap justify-between gap-4">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Sender</p>
                        <p className="font-mono text-sm">{shortAddr(batch.creator_wallet)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Progress</p>
                        <p className="text-sm font-semibold">{paidCount} / {batch.recipients.length} sent</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Network</p>
                        <p className="text-sm font-semibold">{network.label}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Status</p>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${statusColors[batch.status]}`}>
                            {batch.status}
                        </span>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mb-8">
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all"
                            style={{ width: batch.recipients.length > 0 ? `${(paidCount / batch.recipients.length) * 100}%` : '0%' }}
                        />
                    </div>
                </div>

                {/* Recipients */}
                <h3 className="text-base font-semibold mb-4 border-b border-border pb-2">Recipients</h3>
                <div className="space-y-3">
                    {batch.recipients.map((rec, i) => {
                        const payment = payments.find(p => p.recipient_wallet.toLowerCase() === rec.wallet.toLowerCase());
                        return (
                            <div
                                key={i}
                                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${payment ? 'bg-green-500/5 border-green-500/30' : 'bg-card border-border'}`}
                            >
                                <div className="flex items-center gap-3">
                                    {payment
                                        ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                                        : <XCircle size={16} className="text-muted-foreground/40 shrink-0" />
                                    }
                                    <div>
                                        <p className="font-mono text-sm font-medium">{shortAddr(rec.wallet)}</p>
                                        {rec.label && <p className="text-xs text-muted-foreground">{rec.label}</p>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                        <p className="font-semibold">{rec.amount} {tokenSymbol}</p>
                                        <p className={`text-xs ${payment ? 'text-green-400' : 'text-muted-foreground'}`}>
                                            {payment ? 'Sent' : 'Not sent'}
                                        </p>
                                    </div>
                                    {payment?.tx_hash && (
                                        <a
                                            href={getExplorerTxUrl(payment.chain_id ?? batch.chain_id, payment.tx_hash)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                            title="View on Explorer"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-8">
                Powered by <span className="gradient-text font-semibold">Qevor</span> on {network.label}
            </p>
        </div>
    );
}
