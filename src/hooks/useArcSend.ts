import { useState } from 'react';
import { useSendTransaction, usePublicClient } from 'wagmi';
import { parseUnits, parseGwei } from 'viem';
import { arcTestnet } from '@/lib/arcChain';

interface ArcSendParams {
    to: string;
    amount: string; // human-readable decimal, e.g. "0.5"
    onSuccess?: (hash: string) => void;
    onError?: (error: Error) => void;
}

/**
 * Sends native USDC on Arc Testnet.
 *
 * USDC is Arc Testnet's native gas token (18 decimals) — transfers are plain
 * value-bearing transactions, not ERC-20 calls. Using wagmi's sendTransaction
 * directly is the correct approach; Circle's AppKit routes NATIVE→USDC as an
 * ERC-20 call with the wrong decimal scale, causing incorrect amounts.
 */
export function useArcSend() {
    const [isPending, setIsPending] = useState(false);
    const { sendTransactionAsync } = useSendTransaction();
    const publicClient = usePublicClient({ chainId: arcTestnet.id });

    const sendTransaction = async ({ to, amount, onSuccess, onError }: ArcSendParams) => {
        setIsPending(true);
        try {
            const hash = await sendTransactionAsync({
                to:                   to as `0x${string}`,
                value:                parseUnits(amount, 18), // native USDC = 18 decimals
                chain:                arcTestnet,
                maxFeePerGas:         parseGwei('160'),
                maxPriorityFeePerGas: parseGwei('160'),
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
