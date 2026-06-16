import { useBalance, useReadContract } from 'wagmi';
import { getQevorChainByAgentChain } from '@/lib/chains';
import { Loader2 } from 'lucide-react';
import { formatUnits, isAddress } from 'viem';

interface Props {
  address: string;
  chain: string;
  ownerAddress?: string | null;
  escrowMode?: boolean;
}

const qevorAgentEscrowBalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
const zeroAddress = '0x0000000000000000000000000000000000000000' as const;

export function AgentWalletBalance({ address, chain, ownerAddress, escrowMode = false }: Props) {
  const network = getQevorChainByAgentChain(chain);
  const safeOwnerAddress = ownerAddress && isAddress(ownerAddress) ? (ownerAddress as `0x${string}`) : zeroAddress;
  const canReadScopedBalance = escrowMode && isAddress(address) && safeOwnerAddress !== zeroAddress;
  const scopedBalance = useReadContract({
    address: address as `0x${string}`,
    abi: qevorAgentEscrowBalanceAbi,
    functionName: 'balanceOf',
    args: [safeOwnerAddress],
    chainId: network.chain.id,
    query: {
      enabled: canReadScopedBalance,
    },
  });

  const { data, isLoading } = useBalance({
    address: address as `0x${string}`,
    chainId: network.chain.id,
    query: {
      enabled: !canReadScopedBalance && isAddress(address),
    },
  });

  if (isLoading || scopedBalance.isLoading) {
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading balance...
      </div>
    );
  }

  const formatted = canReadScopedBalance
    ? formatUnits(scopedBalance.data ?? 0n, 18)
    : data
      ? formatUnits(data.value, data.decimals)
      : '0';
  const label = canReadScopedBalance ? 'Escrowed for you' : 'Balance';

  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{formatted} {network.paymentAsset}</span>
    </div>
  );
}
