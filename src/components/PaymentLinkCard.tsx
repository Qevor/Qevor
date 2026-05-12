import { Check, Copy, ExternalLink, QrCode, Share2, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';
import { PaymentLinkData } from '@/hooks/usePaymentLinks';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getAppUrl } from '@/lib/appUrl';

interface PaymentLinkCardProps {
    linkData: PaymentLinkData;
}

export function PaymentLinkCard({ linkData }: PaymentLinkCardProps) {
    const [copied, setCopied] = useState(false);

    const payUrl = `${getAppUrl()}/pay?link=${linkData.id}`;

    const isExpired = linkData.expires_at ? new Date(linkData.expires_at) < new Date() : false;
    const isMaxed = linkData.max_uses !== null && linkData.current_uses! >= linkData.max_uses!;

    let statusColor = 'bg-green-500/10 text-green-400 border-green-500/20';
    let statusText = 'ACTIVE';

    if (isExpired) {
        statusColor = 'bg-red-500/10 text-red-400 border-red-500/20';
        statusText = 'EXPIRED';
    } else if (isMaxed) {
        statusColor = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        statusText = 'MAX USES REACHED';
    }

    const handleCopy = async () => {
        await navigator.clipboard.writeText(payUrl);
        setCopied(true);
        toast.success('Link copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="glass-card rounded-xl p-5 space-y-4 shadow-glow border border-border/50 hover:border-primary/30 transition-colors">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-foreground">{linkData.amount.toFixed(2)} USDC</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        Uses: {linkData.current_uses} {linkData.max_uses ? `/ ${linkData.max_uses}` : ''}
                    </p>
                </div>
                <div className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider border ${statusColor}`}>
                    {statusText}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <a
                    href={payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-lg bg-secondary px-3 py-2.5 text-xs text-blue-400 hover:text-blue-300 hover:underline truncate border border-border max-w-[200px] sm:max-w-full"
                >
                    {payUrl}
                </a>
                <a
                    href={payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-border bg-secondary p-2.5 text-foreground hover:bg-muted transition-colors inline-block"
                    title="Open Link"
                >
                    <ExternalLink size={16} />
                </a>
                <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg border border-border bg-secondary p-2.5 text-foreground hover:bg-muted transition-colors"
                    title="Copy Link"
                >
                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="shrink-0 rounded-lg border border-border bg-secondary p-2.5 text-foreground hover:bg-muted transition-colors" title="Share Link">
                            <Share2 size={16} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 bg-secondary border-border text-foreground rounded-xl shadow-glow">
                        <DropdownMenuItem asChild className="cursor-pointer hover:bg-muted focus:bg-muted py-2.5">
                            <a
                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Pay me ${linkData.amount} USDC on Qevor ⚡`)}&url=${encodeURIComponent(payUrl)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2.5 w-full text-sm font-medium"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                Share on X
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer hover:bg-muted focus:bg-muted py-2.5">
                            <a
                                href={`https://t.me/share/url?url=${encodeURIComponent(payUrl)}&text=${encodeURIComponent(`Pay me ${linkData.amount} USDC on Qevor ⚡`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2.5 w-full text-sm font-medium"
                            >
                                <Send size={15} />
                                Share on Telegram
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer hover:bg-muted focus:bg-muted py-2.5">
                            <a
                                href={`https://wa.me/?text=${encodeURIComponent(`Pay me ${linkData.amount} USDC on Qevor ⚡ ${payUrl}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2.5 w-full text-sm font-medium"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                Share on WhatsApp
                            </a>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Dialog>
                    <DialogTrigger asChild>
                        <button className="shrink-0 rounded-lg border border-border bg-secondary p-2.5 text-foreground hover:bg-muted transition-colors" title="Show QR Code">
                            <QrCode size={16} />
                        </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md flex flex-col items-center justify-center p-8 bg-zinc-950 border-zinc-800">
                        <h3 className="text-lg font-semibold mb-4 text-zinc-100">Scan to Pay {linkData.amount} USDC</h3>
                        <div className="bg-white p-4 rounded-xl">
                            <QRCode value={payUrl} size={200} />
                        </div>
                        <p className="text-sm text-zinc-400 mt-6 text-center max-w-[250px] truncate">{payUrl}</p>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                {linkData.expires_at ? (
                    <span>Expires: {new Date(linkData.expires_at).toLocaleString()}</span>
                ) : (
                    <span>No Expiration</span>
                )}
            </div>
        </div>
    );
}
