import { useState } from 'react';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { getQevorChainByKey, type QevorChainKey } from '@/lib/chains';

interface ArcSendParams {
    to: string;
    amount: string;
    chainKey?: QevorChainKey;
    onSuccess?: (hash: string) => void;
    onError?: (error: Error) => void;
}

/**
 * Sends the selected chain's native payment asset.
 */
export function useArcSend() {
    const [isPending, setIsPending] = useState(false);
    const { chainId } = useAccount();
    const { switchChainAsync } = useSwitchChain();
    const { sendTransactionAsync } = useSendTransaction();
    const arcClient = usePublicClient({ chainId: getQevorChainByKey('arc-testnet').chain.id });
    const mantleSepoliaClient = usePublicClient({ chainId: getQevorChainByKey('mantle-sepolia').chain.id });
    const mantleMainnetClient = usePublicClient({ chainId: getQevorChainByKey('mantle-mainnet').chain.id });

    const sendTransaction = async ({ to, amount, chainKey, onSuccess, onError }: ArcSendParams) => {
        setIsPending(true);
        try {
            const network = getQevorChainByKey(chainKey);
            const publicClient = network.key === 'mantle-mainnet'
                ? mantleMainnetClient
                : network.key === 'mantle-sepolia'
                    ? mantleSepoliaClient
                    : arcClient;
            if (chainId !== network.chain.id) {
                await switchChainAsync({ chainId: network.chain.id });
            }
            const hash = await sendTransactionAsync({
                to:    to as `0x${string}`,
                value: parseUnits(amount, network.chain.nativeCurrency.decimals),
                chain: network.chain,
                chainId: network.chain.id,
            });

            await publicClient!.waitForTransactionReceipt({
                hash,
                confirmations: 1,
                timeout: 90_000,
            });

            onSuccess?.(hash);
        } catch (err: unknown) {
            const error = err instanceof Error
                ? err
                : new Error(String((err as any)?.shortMessage ?? (err as any)?.message ?? err));
            onError?.(error);
        } finally {
            setIsPending(false);
        }
    };

    return { sendTransaction, isPending };
}
