import { useState, useEffect } from 'react';
import { Copy, QrCode, CheckCircle2, ChevronRight } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Batch, useBatchPayments } from '@/hooks/useBatchPayments';

interface BatchPaymentCardProps {
    batch: Batch;
}

export function BatchPaymentCard({ batch }: BatchPaymentCardProps) {
    const [copied, setCopied] = useState(false);
    const [paidCount, setPaidCount] = useState(0);
    const { getBatchPayments } = useBatchPayments();

    const batchUrl = `${import.meta.env.VITE_APP_URL || 'https://qevor.app'}/request/${batch.id}`;

    useEffect(() => {
        const fetchPayments = async () => {
            const payments = await getBatchPayments(batch.id);
            setPaidCount(payments.length);
        };
        fetchPayments();
    }, [batch.id]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(batchUrl);
        setCopied(true);
        toast.success('Link copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const statusColors = {
        pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        partial: 'bg-primary/10 text-primary border-primary/20',
        complete: 'bg-green-500/10 text-green-400 border-green-500/20',
    };

    return (
        <div className="glass-card p-5 rounded-2xl flex flex-col gap-4 border border-border/50 hover:border-primary/30 transition-colors">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-semibold text-lg text-foreground line-clamp-1">{batch.title || 'Batch Payment'}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">{batch.description || 'No description provided'}</p>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-semibold lowercase border ${statusColors[batch.status]}`}>
                    {batch.status}
                </div>
            </div>

            <div className="flex items-center gap-4 text-sm mt-2">
                <div className="flex-1 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{paidCount} / {batch.recipients.length} paid</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                            className="h-full bg-primary"
                            style={{ width: `${(paidCount / batch.recipients.length) * 100}%` }}
                        />
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total USDC</div>
                    <div className="font-semibold text-foreground">{batch.total_amount.toFixed(2)}</div>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2 pt-4 border-t border-border">
                <button
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-secondary hover:bg-muted py-2.5 text-sm font-medium transition-colors"
                >
                    {copied ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>

                <Dialog>
                    <DialogTrigger asChild>
                        <button className="flex items-center justify-center rounded-xl bg-secondary hover:bg-muted px-4 py-2.5 transition-colors">
                            <QrCode size={16} />
                        </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-card border-border flex flex-col items-center p-8">
                        <h3 className="text-xl font-bold gradient-text mb-4 text-center">Batch Payment</h3>
                        <div className="bg-white p-4 rounded-xl shadow-glow">
                            <QRCode value={batchUrl} size={200} />
                        </div>
                        <p className="text-sm text-muted-foreground text-center mt-6 break-all w-full leading-relaxed border border-border p-3 rounded-lg bg-secondary/50">
                            {batchUrl}
                        </p>
                    </DialogContent>
                </Dialog>

                <a
                    href={batchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2.5 transition-colors"
                >
                    <ChevronRight size={18} />
                </a>
            </div>
        </div>
    );
}
