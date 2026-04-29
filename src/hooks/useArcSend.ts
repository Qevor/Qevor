import { useState } from 'react';
import { useAccount } from 'wagmi';
import { arcKit } from '@/lib/arcKit';
import { ViemAdapter, resolveChainIdentifier } from '@circle-fin/adapter-viem-v2';
import { createWalletClient, createPublicClient, custom, http, type Chain } from 'viem';
import type { EIP1193Provider } from 'viem';

interface ArcSendParams {
    to: string;
    amount: string; // human-readable decimal, e.g. "1.5"
    onSuccess?: (hash: string) => void;
    onError?: (error: Error) => void;
}

export function useArcSend() {
    const { connector, address } = useAccount();
    const [isPending, setIsPending] = useState(false);

    const sendTransaction = async ({ to, amount, onSuccess, onError }: ArcSendParams) => {
        if (!connector || !address) {
            onError?.(new Error('No wallet connected'));
            return;
        }

        setIsPending(true);
        try {
            const rawProvider = (await connector.getProvider()) as EIP1193Provider;

            // Wrap provider to silently ignore wallet_switchEthereumChain —
            // the Dynamic Labs embedded wallet doesn't support it and the
            // session is already scoped to Arc Testnet.
            const provider = {
                request: async (args: { method: string; params: unknown[] }) => {
                    if (args.method === 'wallet_switchEthereumChain' || args.method === 'wallet_addEthereumChain') {
                        return null;
                    }
                    return rawProvider.request(args as any);
                },
            };

            // Build ViemAdapter directly with the already-known address.
            // Avoids calling eth_requestAccounts which Dynamic Labs embedded
            // wallets do not support (the session is already established).
            const adapter = new ViemAdapter(
                {
                    getPublicClient: ({ chain }: { chain: Chain }) =>
                        createPublicClient({
                            chain,
                            transport: http('https://rpc.testnet.arc.network'),
                        }) as any,
                    getWalletClient: ({ chain }: { chain: Chain }) =>
                        createWalletClient({
                            account: address,
                            chain,
                            transport: custom(provider as any),
                        }),
                },
                {
                    addressContext: 'user-controlled',
                    supportedChains: [resolveChainIdentifier('Arc_Testnet')],
                },
            );

            const result = await arcKit.send({
                from: { adapter, chain: 'Arc_Testnet' },
                to,
                amount,
                token: 'USDC',
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
