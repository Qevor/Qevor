import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAuditLog } from '@/lib/agents/queries';
import type { AgentAuditEntry } from '@/lib/agents/types';

const EXPLORER_URL = 'https://testnet.arcscan.app';
const PAGE_SIZE = 20;

interface Props {
  agentWalletId: string;
}

export function AuditLogViewer({ agentWalletId }: Props) {
  const [entries, setEntries] = useState<AgentAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { entries: data, count } = await fetchAuditLog(agentWalletId, {
        outcome: outcomeFilter === 'all' ? undefined : outcomeFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setEntries(data);
      setTotal(count);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [agentWalletId, outcomeFilter, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const outcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'executed': return <Badge className="bg-green-600">executed</Badge>;
      case 'blocked': return <Badge variant="destructive">blocked</Badge>;
      case 'cosign_required': return <Badge className="bg-yellow-600">cosign</Badge>;
      case 'failed': return <Badge variant="destructive">failed</Badge>;
      default: return <Badge variant="outline">{outcome}</Badge>;
    }
  };

  const truncate = (s: string) => s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

  const exportCsv = () => {
    const header = 'Timestamp,Action,Recipient,Amount USDC,Outcome,Reason,TX Hash\n';
    const rows = entries.map((e) =>
      [
        e.created_at,
        e.action,
        e.recipient_username ?? e.recipient_address ?? '',
        e.amount_usdc ?? '',
        e.outcome,
        e.reason ?? '',
        e.tx_hash ?? '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${agentWalletId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">History</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="executed">Executed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="cosign_required">Cosign</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
              <Download className="mr-1 h-3 w-3" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3">Time</th>
                    <th className="pb-2 pr-3">Action</th>
                    <th className="pb-2 pr-3">Recipient</th>
                    <th className="pb-2 pr-3">Amount</th>
                    <th className="pb-2 pr-3">Outcome</th>
                    <th className="pb-2 pr-3">Reason</th>
                    <th className="pb-2">TX</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">{e.action}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {e.recipient_username ? `@${e.recipient_username}` : e.recipient_address ? truncate(e.recipient_address) : '-'}
                      </td>
                      <td className="py-2 pr-3">{e.amount_usdc != null ? `$${e.amount_usdc}` : '-'}</td>
                      <td className="py-2 pr-3">{outcomeBadge(e.outcome)}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[150px] truncate">
                        {e.reason ?? '-'}
                      </td>
                      <td className="py-2">
                        {e.tx_hash ? (
                          <a
                            href={`${EXPLORER_URL}/tx/${e.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {truncate(e.tx_hash)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">
                  {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
