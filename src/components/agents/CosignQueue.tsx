import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchCosignQueue, approveCosignEntry, rejectCosignEntry } from '@/lib/agents/queries';
import type { CosignQueueEntry } from '@/lib/agents/types';

interface Props {
  agentWalletId: string;
  profileWallet: string;
}

export function CosignQueue({ agentWalletId, profileWallet }: Props) {
  const [entries, setEntries] = useState<CosignQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCosignQueue(agentWalletId, 'pending');
      setEntries(data);
    } catch (err) {
      console.error('Failed to load cosign queue:', err);
    } finally {
      setLoading(false);
    }
  }, [agentWalletId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (entry: CosignQueueEntry) => {
    setActionLoading(entry.id);
    try {
      await approveCosignEntry(entry.id, profileWallet);
      toast.success('Approved. The executor will process the transfer shortly.');
      await load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (entry: CosignQueueEntry) => {
    setActionLoading(entry.id);
    try {
      await rejectCosignEntry(entry.id);
      toast.success('Rejected.');
      await load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const timeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m remaining`;
  };

  const truncate = (s: string) => s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

  if (loading) return <p className="text-sm text-muted-foreground">Loading cosign queue...</p>;

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No pending approvals.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Pending Approvals</h3>
      {/* TODO: Wire email/push notifications when something hits the cosign queue */}
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {entry.recipient_username ? `@${entry.recipient_username}` : truncate(entry.recipient_address)}
                </div>
                <div className="text-lg font-bold">${entry.amount_usdc} USDC</div>
                <div className="text-xs text-muted-foreground">{entry.reason}</div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {timeRemaining(entry.expires_at)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleApprove(entry)}
                disabled={actionLoading === entry.id}
              >
                {actionLoading === entry.id ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleReject(entry)}
                disabled={actionLoading === entry.id}
              >
                <XCircle className="mr-1 h-4 w-4" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
