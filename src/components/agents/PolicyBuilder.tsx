import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Shield, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import type { AgentPolicy } from '@/lib/agents/types';
import { describePolicy } from '@/lib/agents/describe-policy';
import { fetchPolicy, upsertPolicy } from '@/lib/agents/queries';

interface Props {
  agentWalletId: string;
  chain: string;
  onSaved?: () => void;
}

export function PolicyBuilder({ agentWalletId, chain, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Circle-native fields
  const [maxPerTx, setMaxPerTx] = useState('');
  const [dailyCap, setDailyCap] = useState('');
  const [weeklyCap, setWeeklyCap] = useState('');
  const [monthlyCap, setMonthlyCap] = useState('');
  const [allowlistAddrs, setAllowlistAddrs] = useState<string[]>([]);
  const [blocklistAddrs, setBlocklistAddrs] = useState<string[]>([]);
  const [newAllowAddr, setNewAllowAddr] = useState('');
  const [newBlockAddr, setNewBlockAddr] = useState('');

  // Qevor-only fields
  const [allowlistUsernames, setAllowlistUsernames] = useState<string[]>([]);
  const [blocklistUsernames, setBlocklistUsernames] = useState<string[]>([]);
  const [newAllowUser, setNewAllowUser] = useState('');
  const [newBlockUser, setNewBlockUser] = useState('');
  const [hoursFrom, setHoursFrom] = useState('');
  const [hoursTo, setHoursTo] = useState('');
  const [cosignThreshold, setCosignThreshold] = useState('');

  useEffect(() => {
    fetchPolicy(agentWalletId).then((p) => {
      if (p) {
        setMaxPerTx(p.max_per_tx_usdc?.toString() ?? '');
        setDailyCap(p.daily_cap_usdc?.toString() ?? '');
        setWeeklyCap(p.weekly_cap_usdc?.toString() ?? '');
        setMonthlyCap(p.monthly_cap_usdc?.toString() ?? '');
        setAllowlistAddrs(p.allowlist_addresses ?? []);
        setBlocklistAddrs(p.blocklist_addresses ?? []);
        setAllowlistUsernames(p.allowlist_usernames ?? []);
        setBlocklistUsernames(p.blocklist_usernames ?? []);
        setCosignThreshold(p.cosign_threshold_usdc?.toString() ?? '');
        if (p.allowed_hours_utc) {
          const match = p.allowed_hours_utc.match(/\[(\d+),(\d+)\)/);
          if (match) {
            setHoursFrom(match[1]);
            setHoursTo(match[2]);
          }
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agentWalletId]);

  const addToList = (
    value: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void,
    validate?: (v: string) => boolean,
  ) => {
    const trimmed = value.trim().replace(/^@/, '');
    if (!trimmed) return;
    if (validate && !validate(trimmed)) {
      toast.error('Invalid value');
      return;
    }
    if (list.includes(trimmed)) {
      toast.error('Already in list');
      return;
    }
    setList([...list, trimmed]);
    setInput('');
  };

  const removeFromList = (idx: number, list: string[], setList: (v: string[]) => void) => {
    setList(list.filter((_, i) => i !== idx));
  };

  const buildPolicy = (): Partial<AgentPolicy> => {
    const p: Partial<AgentPolicy> = {
      max_per_tx_usdc: maxPerTx ? parseFloat(maxPerTx) : null,
      daily_cap_usdc: dailyCap ? parseFloat(dailyCap) : null,
      weekly_cap_usdc: weeklyCap ? parseFloat(weeklyCap) : null,
      monthly_cap_usdc: monthlyCap ? parseFloat(monthlyCap) : null,
      allowlist_addresses: allowlistAddrs,
      blocklist_addresses: blocklistAddrs,
      allowlist_usernames: allowlistUsernames,
      blocklist_usernames: blocklistUsernames,
      cosign_threshold_usdc: cosignThreshold ? parseFloat(cosignThreshold) : null,
      allowed_hours_utc: hoursFrom && hoursTo ? `[${hoursFrom},${hoursTo})` : null,
    };
    return p;
  };

  const validate = (): string | null => {
    const perTx = maxPerTx ? parseFloat(maxPerTx) : null;
    const daily = dailyCap ? parseFloat(dailyCap) : null;
    const weekly = weeklyCap ? parseFloat(weeklyCap) : null;
    const monthly = monthlyCap ? parseFloat(monthlyCap) : null;

    if (perTx != null && daily != null && perTx > daily) return 'Per-tx cap must be <= daily cap';
    if (daily != null && weekly != null && daily > weekly) return 'Daily cap must be <= weekly cap';
    if (weekly != null && monthly != null && weekly > monthly) return 'Weekly cap must be <= monthly cap';

    if (hoursFrom && hoursTo) {
      const f = parseInt(hoursFrom);
      const t = parseInt(hoursTo);
      if (isNaN(f) || isNaN(t) || f < 0 || f > 23 || t < 0 || t > 24) {
        return 'Hours must be 0-23 (from) and 0-24 (to)';
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await upsertPolicy(agentWalletId, buildPolicy());
      toast.success('Policy saved');
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  // Build preview
  const preview = describePolicy({
    ...buildPolicy(),
    id: '', agent_wallet_id: agentWalletId, active: true,
    mirrored_to_circle_at: null, created_at: '', updated_at: '',
  } as AgentPolicy);

  const isMantle = chain === 'MANTLE-SEPOLIA' || chain === 'MANTLE-MAINNET';
  const isTestnet = chain === 'ARC-TESTNET' || chain === 'MANTLE-SEPOLIA';
  const policyAsset = isMantle ? 'MNT' : 'USDC';
  const enforcementLabel = isMantle
    ? `Enforced by Qevor escrow on ${chain === 'MANTLE-MAINNET' ? 'Mantle mainnet' : 'Mantle testnet'}`
    : isTestnet
      ? 'Enforced by Qevor on testnet'
      : 'Enforced by Circle on mainnet';

  if (loading) return <p className="text-muted-foreground">Loading policy...</p>;

  return (
    <div className="space-y-6">
      {/* Section A: Circle-native */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle className="text-base">On-chain limits</CardTitle>
            <Badge variant="outline" className="text-xs">
              {enforcementLabel}
            </Badge>
          </div>
          <CardDescription>
            These limits keep autonomous execution inside your selected payment rail.
            {isTestnet && ' On testnet, Qevor enforces them via the executor.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Max per transaction ({policyAsset})</Label>
              <Input type="number" min="0" step="0.01" value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} placeholder="50" />
            </div>
            <div className="space-y-1">
              <Label>Daily cap ({policyAsset})</Label>
              <Input type="number" min="0" step="0.01" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="500" />
            </div>
            <div className="space-y-1">
              <Label>Weekly cap ({policyAsset})</Label>
              <Input type="number" min="0" step="0.01" value={weeklyCap} onChange={(e) => setWeeklyCap(e.target.value)} placeholder="2000" />
            </div>
            <div className="space-y-1">
              <Label>Monthly cap ({policyAsset})</Label>
              <Input type="number" min="0" step="0.01" value={monthlyCap} onChange={(e) => setMonthlyCap(e.target.value)} placeholder="5000" />
            </div>
          </div>

          <Separator />

          {/* Allowlist addresses */}
          <div className="space-y-2">
            <Label>Allowlist addresses</Label>
            <div className="flex gap-2">
              <Input placeholder="0x..." value={newAllowAddr} onChange={(e) => setNewAllowAddr(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => addToList(newAllowAddr, allowlistAddrs, setAllowlistAddrs, setNewAllowAddr, isAddress)}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {allowlistAddrs.map((a, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {a.slice(0, 6)}...{a.slice(-4)}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromList(i, allowlistAddrs, setAllowlistAddrs)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Blocklist addresses */}
          <div className="space-y-2">
            <Label>Blocklist addresses</Label>
            <div className="flex gap-2">
              <Input placeholder="0x..." value={newBlockAddr} onChange={(e) => setNewBlockAddr(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => addToList(newBlockAddr, blocklistAddrs, setBlocklistAddrs, setNewBlockAddr, isAddress)}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {blocklistAddrs.map((a, i) => (
                <Badge key={i} variant="destructive" className="gap-1">
                  {a.slice(0, 6)}...{a.slice(-4)}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromList(i, blocklistAddrs, setBlocklistAddrs)} />
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Qevor-only */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle className="text-base">Qevor rules</CardTitle>
            <Badge variant="outline" className="text-xs">Enforced by Qevor executor</Badge>
          </div>
          <CardDescription>
            These rules are always enforced by the Qevor executor, regardless of chain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Allowlist usernames */}
          <div className="space-y-2">
            <Label>Allowlist usernames</Label>
            <div className="flex gap-2">
              <Input placeholder="@username" value={newAllowUser} onChange={(e) => setNewAllowUser(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => addToList(newAllowUser, allowlistUsernames, setAllowlistUsernames, setNewAllowUser)}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {allowlistUsernames.map((u, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  @{u}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromList(i, allowlistUsernames, setAllowlistUsernames)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Blocklist usernames */}
          <div className="space-y-2">
            <Label>Blocklist usernames</Label>
            <div className="flex gap-2">
              <Input placeholder="@username" value={newBlockUser} onChange={(e) => setNewBlockUser(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => addToList(newBlockUser, blocklistUsernames, setBlocklistUsernames, setNewBlockUser)}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {blocklistUsernames.map((u, i) => (
                <Badge key={i} variant="destructive" className="gap-1">
                  @{u}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromList(i, blocklistUsernames, setBlocklistUsernames)} />
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Allowed hours */}
          <div className="space-y-2">
            <Label>Allowed hours UTC</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="23" placeholder="9" value={hoursFrom} onChange={(e) => setHoursFrom(e.target.value)} className="w-20" />
              <span className="text-muted-foreground">to</span>
              <Input type="number" min="0" max="24" placeholder="18" value={hoursTo} onChange={(e) => setHoursTo(e.target.value)} className="w-20" />
              <span className="text-sm text-muted-foreground">UTC</span>
            </div>
          </div>

          {/* Cosign threshold */}
          <div className="space-y-1">
            <Label>Cosign threshold ({policyAsset})</Label>
            <Input type="number" min="0" step="0.01" value={cosignThreshold} onChange={(e) => setCosignThreshold(e.target.value)} placeholder="200" />
            <p className="text-xs text-muted-foreground">
              Transfers above this amount will require your manual approval.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm italic text-muted-foreground">{preview}</p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Policy
      </Button>
    </div>
  );
}
