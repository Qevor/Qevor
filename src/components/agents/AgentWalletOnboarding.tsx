import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';

interface Props {
  onRegister: (address: string, label: string) => Promise<void>;
  registering: boolean;
}

const STEPS = [
  {
    title: 'Install Circle CLI',
    description: 'Requires Node 20.18.2 or later.',
    command: 'npm install -g @circle-fin/cli',
  },
  {
    title: 'Log in to Circle',
    description: 'You will receive an email OTP to verify your identity.',
    command: 'circle wallet login you@example.com --testnet',
  },
  {
    title: 'List your agent wallets',
    description: 'Find your wallet address on Arc Testnet.',
    command: 'circle wallet list --chain ARC-TESTNET --type agent --output json',
  },
  {
    title: 'Register your wallet',
    description: 'Paste the 0x… address below to connect it to your Qevor account.',
    command: null,
  },
];

export function AgentWalletOnboarding({ onRegister, registering }: Props) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
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
    await onRegister(trimmed, label.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an Agent Wallet</CardTitle>
        <CardDescription>
          Follow the Circle CLI quickstart to create and register your agent wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-muted-foreground">
          Qevor never sees your Circle CLI session or your wallet's authentication.
          Your agent wallet is controlled entirely by you via the Circle CLI.
          Qevor stores only your wallet's public address and your spending policies.
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
          <Input
            placeholder="0x… wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Input
            placeholder="Label (optional, e.g. 'Payroll Wallet')"
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
