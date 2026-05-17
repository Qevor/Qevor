import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Settings, Play, History } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentWallet } from '@/lib/agents/types';
import { AgentWalletBalance } from './AgentWalletBalance';
import { AuditLogViewer } from './AuditLogViewer';

interface Props {
  wallets: AgentWallet[];
  onEditPolicy: (wallet: AgentWallet) => void;
  onEnableExecutor: (wallet: AgentWallet) => void;
}

export function AgentWalletList({ wallets, onEditPolicy, onEnableExecutor }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  const copyAddress = (addr: string, id: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedId(id);
    toast.success('Address copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const truncate = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'paused': return 'secondary';
      case 'revoked': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      {wallets.map((w) => (
        <Card key={w.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {w.label || 'Agent Wallet'}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={statusColor(w.status)}>{w.status}</Badge>
                {w.executor_mode && (
                  <Badge variant="outline">executor: {w.executor_mode}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Address:</span>
              <code className="rounded bg-muted px-2 py-1">
                {truncate(w.wallet_address)}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyAddress(w.wallet_address, w.id)}
              >
                {copiedId === w.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              <span className="text-muted-foreground">Chain: {w.chain}</span>
            </div>

            <AgentWalletBalance address={w.wallet_address} />

            {w.escrow_address && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Escrow:</span>
                <code className="rounded bg-muted px-2 py-1">
                  {truncate(w.escrow_address)}
                </code>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEditPolicy(w)}>
                <Settings className="mr-1 h-4 w-4" /> Edit Policy
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowHistoryFor(showHistoryFor === w.id ? null : w.id)}>
                <History className="mr-1 h-4 w-4" /> History
              </Button>
              {!w.executor_mode && (
                <Button variant="outline" size="sm" onClick={() => onEnableExecutor(w)}>
                  <Play className="mr-1 h-4 w-4" /> Enable Autonomous Execution
                </Button>
              )}
            </div>

            {showHistoryFor === w.id && (
              <AuditLogViewer agentWalletId={w.id} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
