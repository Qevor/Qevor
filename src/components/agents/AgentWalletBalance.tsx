import { useBalance } from 'wagmi';
import { getQevorChainByAgentChain } from '@/lib/chains';
import { Loader2 } from 'lucide-react';
import { formatUnits } from 'viem';

interface Props {
  address: string;
  chain: string;
}

export function AgentWalletBalance({ address, chain }: Props) {
  const network = getQevorChainByAgentChain(chain);
  const { data, isLoading } = useBalance({
    address: address as `0x${string}`,
    chainId: network.chain.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading balance...
      </div>
    );
  }

  const formatted = data ? formatUnits(data.value, data.decimals) : '0';

  return (
    <div className="text-sm">
      <span className="text-muted-foreground">Balance: </span>
      <span className="font-medium">{formatted} {network.paymentAsset}</span>
    </div>
  );
}
