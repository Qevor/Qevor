import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReceipts, Receipt } from '@/hooks/useReceipts';
import { CheckCircle2, Copy, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getExplorerTxUrl, getQevorChainById } from '@/lib/chains';

export default function ReceiptPage() {
    const { id } = useParams<{ id: string }>();
    const { getReceipt, loading, error } = useReceipts();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (id) {
            getReceipt(id).then(data => {
                if (data) setReceipt(data);
            });
        }
    }, [id]);

    const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const receiptNetwork = getQevorChainById(receipt?.chain_id);

    const handleCopy = async () => {
        if (receipt?.tx_hash) {
            await navigator.clipboard.writeText(receipt.tx_hash);
            setCopied(true);
            toast.success('Tx Hash copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    if (error || !receipt) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="glass-card rounded-xl p-8 text-center max-w-sm space-y-3 shadow-glow-lg border-red-500/30">
                    <p className="text-foreground font-semibold">Receipt Not Found</p>
                    <p className="text-muted-foreground text-sm">{error || 'This receipt does not exist.'}</p>
                    <Link to="/" className="text-primary hover:underline text-sm block mt-4">Return Home</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
            <div className="w-full max-w-md space-y-6">
                <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
                    <ArrowLeft size={16} />
                    Back to Home
                </Link>

                <div className="glass-card rounded-xl p-8 space-y-6 shadow-glow-lg border-green-500/30">
                    <div className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                            <CheckCircle2 size={28} className="text-green-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">Payment Receipt</h1>
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            {receipt.status.toUpperCase()}
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Amount</span>
                            <span className="text-xl font-bold gradient-text">{receipt.amount.toFixed(2)} {receipt.token_symbol ?? receiptNetwork.paymentAsset}</span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Network</span>
                            <span className="text-sm text-foreground font-medium">{receiptNetwork.label}</span>
                        </div>

                        {receipt.memo && (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">Memo</span>
                                <span className="text-sm text-foreground">{receipt.memo}</span>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Date</span>
                            <span className="text-sm text-foreground font-medium">
                                {new Date(receipt.created_at).toLocaleString()}
                            </span>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-border">
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">From (Sender)</span>
                                <span className="text-sm font-mono text-foreground bg-secondary px-2 py-1 rounded-md border border-border block">
                                    {receipt.sender}
                                </span>
                            </div>

                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">To (Receiver)</span>
                                <span className="text-sm font-mono text-foreground bg-secondary px-2 py-1 rounded-md border border-border block">
                                    {receipt.receiver}
                                </span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border space-y-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Transaction Hash</span>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 rounded-lg bg-secondary px-3 py-2 text-xs text-foreground truncate border border-border">
                                    {shortAddr(receipt.tx_hash)}
                                </code>
                                <button
                                    onClick={handleCopy}
                                    className="shrink-0 rounded-lg border border-border bg-secondary p-2 text-foreground hover:bg-muted transition-colors"
                                    title="Copy Hash"
                                >
                                    {copied ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <a
                        href={getExplorerTxUrl(receipt.chain_id, receipt.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                        View on Explorer
                        <ExternalLink size={16} />
                    </a>
                </div>
            </div>
        </div>
    );
}
