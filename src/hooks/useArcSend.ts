import { useState } from 'react';
import { useAccount } from 'wagmi';
import { arcKit } from '@/lib/arcKit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import type { EIP1193Provider } from 'viem';

interface ArcSendParams {
    to: string;
    amount: string; // human-readable decimal, e.g. "1.5"
    onSuccess?: (hash: string) => void;
    onError?: (error: Error) => void;
}

export function useArcSend() {
    const { connector } = useAccount();
    const [isPending, setIsPending] = useState(false);

    const sendTransaction = async ({ to, amount, onSuccess, onError }: ArcSendParams) => {
        if (!connector) {
            onError?.(new Error('No wallet connected'));
            return;
        }

        setIsPending(true);
        try {
            const provider = (await connector.getProvider()) as EIP1193Provider;
            const adapter = await createViemAdapterFromProvider({ provider });

            const result = await arcKit.send({
                from: { adapter, chain: 'Arc_Testnet' },
                to,
                amount,
                token: 'NATIVE',
            });

            if (result.state === 'error') {
                throw new Error('Transaction failed on-chain');
            }

            onSuccess?.(result.txHash ?? '');
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String((err as any)?.message ?? err));
            onError?.(error);
        } finally {
            setIsPending(false);
        }
    };

    return { sendTransaction, isPending };
}
