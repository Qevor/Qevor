import { useState, useEffect } from 'react';
import { ExternalLink, ChevronRight, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Batch, BatchPayment, BatchRecipient, useBatchPayments } from '@/hooks/useBatchPayments';

interface BatchPaymentCardProps {
    batch: Batch;
    onSend?: (unsentRecipients: BatchRecipient[]) => void;
}

export function BatchPaymentCard({ batch, onSend }: BatchPaymentCardProps) {
    const [payments, setPayments] = useState<BatchPayment[]>([]);
    const { getBatchPayments } = useBatchPayments();

    useEffect(() => {
        getBatchPayments(batch.id).then(setPayments);
    }, [batch.id]);

    const statusColors = {
        pending:  'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        partial:  'bg-primary/10 text-primary border-primary/20',
        complete: 'bg-green-500/10 text-green-400 border-green-500/20',
    };

    const paidCount      = payments.length;
    const totalRecipients = batch.recipients.length;
    const isComplete     = batch.status === 'complete';

    const unsentRecipients = batch.recipients.filter(
        r => !payments.some(p => p.recipient_wallet.toLowerCase() === r.wallet.toLowerCase())
    );

    return (
        <div className="glass-card p-5 rounded-2xl flex flex-col gap-4 border border-border/50 hover:border-primary/30 transition-colors">
            {/* Header */}
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <h3 className="font-semibold text-lg text-foreground line-clamp-1">
                        {batch.title || 'Batch Payment'}
                    </h3>
                    {batch.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{batch.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(batch.created_at).toLocaleString()}
                    </p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold lowercase border ${statusColors[batch.status]}`}>
                    {batch.status}
                </span>
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{paidCount} of {totalRecipients} sent</span>
                    <span className="font-semibold text-foreground">
                        {batch.total_amount.toFixed(2)} USDC
                    </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all"
                        style={{ width: totalRecipients > 0 ? `${(paidCount / totalRecipients) * 100}%` : '0%' }}
                    />
                </div>
            </div>

            {/* Recipient rows */}
            <div className="space-y-1.5">
                {batch.recipients.map((rec, i) => {
                    const payment = payments.find(
                        p => p.recipient_wallet.toLowerCase() === rec.wallet.toLowerCase()
                    );
                    return (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                {payment
                                    ? <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                                    : <XCircle     size={13} className="text-muted-foreground/40 shrink-0" />
                                }
                                <span className="font-mono text-xs text-muted-foreground truncate">
                                    {rec.wallet.slice(0, 6)}…{rec.wallet.slice(-4)}
                                </span>
                                {rec.label && (
                                    <span className="text-xs text-muted-foreground truncate">· {rec.label}</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`font-medium text-xs ${payment ? '' : 'text-muted-foreground'}`}>
                                    {Number(rec.amount).toFixed(2)} USDC
                                </span>
                                {payment?.tx_hash && (
                                    <a
                                        href={`https://testnet.arcscan.app/tx/${payment.tx_hash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:text-primary/80 transition-colors"
                                        title="View on Explorer"
                                    >
                                        <ExternalLink size={11} />
                                    </a>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer actions */}
            <div className={`pt-3 border-t border-border grid gap-2 ${!isComplete ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {!isComplete && (
                    <button
                        onClick={() => onSend?.(unsentRecipients)}
                        disabled={unsentRecipients.length === 0}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Send size={13} />
                        Send{unsentRecipients.length > 0 ? ` (${unsentRecipients.length})` : ''}
                    </button>
                )}
                <a
                    href={`/request/${batch.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-secondary hover:bg-muted py-2.5 text-sm font-medium transition-colors"
                >
                    View Receipt <ChevronRight size={14} />
                </a>
            </div>
        </div>
    );
}
