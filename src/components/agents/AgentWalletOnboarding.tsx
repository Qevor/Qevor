import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import { qevorChains } from '@/lib/chains';

interface Props {
  onRegister: (address: string, label: string, chain: string) => Promise<void>;
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
  const [chain, setChain] = useState(qevorChains[0].agentChainCode);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

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
    await onRegister(trimmed, label.trim(), chain);
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
