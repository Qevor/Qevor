import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Check, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import { qevorChains } from '@/lib/chains';

interface Props {
  onRegister: (
    address: string,
    label: string,
    chain: string,
    opts?: { executorMode?: 'escrow'; escrowAddress?: string | null },
  ) => Promise<void>;
  registering: boolean;
}

const STEPS = [
  {
    title: 'Install the agent tool',
    description: 'Use Circle CLI for Arc, or the Mantle executor key with optional Byreal CLI preflight.',
    command: 'npm install -g @circle-fin/cli',
  },
  {
    title: 'Authenticate the rail',
    description: 'Arc uses Circle OTP. Mantle Sepolia uses the configured executor wallet key.',
    command: 'circle wallet login you@example.com --testnet',
  },
  {
    title: 'List or copy your agent wallet',
    description: 'For Mantle, paste the deployed QevorAgentEscrow contract address after it is funded.',
    command: 'circle wallet list --chain ARC-TESTNET --type agent --output json',
  },
  {
    title: 'Register your wallet',
    description: 'Paste the public 0x address below to connect it to your Qevor account.',
    command: null,
  },
];

export function AgentWalletOnboarding({ onRegister, registering }: Props) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const mantleNetwork = qevorChains.find((network) => network.agentChainCode === 'MANTLE-SEPOLIA');
  const [chain, setChain] = useState(mantleNetwork?.agentChainCode ?? qevorChains[0].agentChainCode);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const selectedNetwork = qevorChains.find((network) => network.agentChainCode === chain) ?? qevorChains[0];
  const selectedEscrow = selectedNetwork.agentEscrowAddress;
  const isMantleEscrow = !!selectedEscrow && address.trim().toLowerCase() === selectedEscrow.toLowerCase();

  const copyCommand = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleSubmit = async () => {
    const trimmed = address.trim();
    if (!isAddress(trimmed)) {
      toast.error('Invalid Ethereum address');
      return;
    }
    await onRegister(
      trimmed,
      label.trim(),
      chain,
      isMantleEscrow ? { executorMode: 'escrow', escrowAddress: selectedEscrow } : undefined,
    );
  };

  const useMantleEscrow = () => {
    if (!selectedEscrow) return;
    setAddress(selectedEscrow);
    setLabel((current) => current || 'Qevor Mantle Agent Escrow');
    toast.success('Mantle escrow selected');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an Agent Wallet</CardTitle>
        <CardDescription>
          Register an agent wallet for Arc or Mantle Sepolia execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-muted-foreground">
          Qevor stores only the public wallet address and policy settings. Mantle execution stays disabled until the VPS has a matching testnet agent key and, when available, a Byreal preflight command.
          For contract-backed Mantle agents, register the deployed escrow contract address.
        </div>

        {STEPS.map((step, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {i + 1}
              </div>
              <h3 className="font-medium">{step.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground ml-8">{step.description}</p>
            {step.command && (
              <div className="ml-8 flex items-center gap-2 rounded-md bg-muted p-3 font-mono text-sm">
                <code className="flex-1 overflow-x-auto">{step.command}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyCommand(step.command!, i)}
                >
                  {copiedIdx === i ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        ))}

        <div className="ml-8 space-y-3">
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {qevorChains.map((network) => (
              <option key={network.agentChainCode} value={network.agentChainCode}>
                {network.label} ({network.paymentAsset})
              </option>
            ))}
          </select>
          {selectedEscrow && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Deployed Mantle escrow
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedEscrow}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={useMantleEscrow}>
                  Use this escrow
                </Button>
              </div>
              {isMantleEscrow && (
                <p className="mt-2 text-xs text-emerald-500">
                  This will register the wallet as an enabled policy-gated agent executor.
                </p>
              )}
            </div>
          )}
          <Input
            placeholder="0x... wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Input
            placeholder="Label (optional, e.g. Payroll Wallet)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button onClick={handleSubmit} disabled={registering || !address.trim()}>
            {registering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register Wallet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
