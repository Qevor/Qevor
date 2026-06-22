import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { DEFAULT_QEVOR_CHAIN_KEY, getQevorChainByKey, MULTICALL3_ADDRESS, type QevorChainKey } from '@/lib/chains';

const multicall3Abi = [
    {
        inputs: [
            {
                components: [
                    { name: 'target',       type: 'address' },
                    { name: 'allowFailure', type: 'bool'    },
                    { name: 'value',        type: 'uint256' },
                    { name: 'callData',     type: 'bytes'   },
                ],
                name: 'calls',
                type: 'tuple[]',
            },
        ],
        name: 'aggregate3Value',
        outputs: [
            {
                components: [
                    { name: 'success',    type: 'bool'  },
                    { name: 'returnData', type: 'bytes' },
                ],
                name: 'returnData',
                type: 'tuple[]',
            },
        ],
        stateMutability: 'payable',
        type: 'function',
    },
] as const;

export interface BatchSendRecipient {
    wallet: `0x${string}`;
    amount: number;
}

export interface BatchSendResult {
    txHash: string;
    totalSent: number;
}

export function useBatchSend() {
    const { writeContractAsync, isPending } = useWriteContract();
    const { chainId } = useAccount();
    const { switchChainAsync } = useSwitchChain();
    const arcClient = usePublicClient({ chainId: getQevorChainByKey('arc-testnet').chain.id });
    const mantleSepoliaClient = usePublicClient({ chainId: getQevorChainByKey('mantle-sepolia').chain.id });
    const mantleMainnetClient = usePublicClient({ chainId: getQevorChainByKey('mantle-mainnet').chain.id });

    const sendBatch = async (
        recipients: BatchSendRecipient[],
        chainKey: QevorChainKey = DEFAULT_QEVOR_CHAIN_KEY,
    ): Promise<BatchSendResult> => {
        if (recipients.length === 0) throw new Error('No recipients');

        const network = getQevorChainByKey(chainKey);
        const publicClient = network.key === 'mantle-mainnet'
            ? mantleMainnetClient
            : network.key === 'mantle-sepolia'
                ? mantleSepoliaClient
                : arcClient;
        const decimals = network.chain.nativeCurrency.decimals;
        if (chainId !== network.chain.id) {
            await switchChainAsync({ chainId: network.chain.id });
        }

        const calls = recipients.map(r => ({
            target:       r.wallet,
            allowFailure: false,
            value:        parseUnits(r.amount.toString(), decimals),
            callData:     '0x' as `0x${string}`,
        }));

        const totalValue = calls.reduce((sum, c) => sum + c.value, 0n);

        const txHash = await writeContractAsync({
            address:      MULTICALL3_ADDRESS,
            abi:          multicall3Abi,
            functionName: 'aggregate3Value',
            args:         [calls],
            value:        totalValue,
            chain:        network.chain,
            chainId:      network.chain.id,
        });

        await publicClient!.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

        return {
            txHash,
            totalSent: recipients.reduce((s, r) => s + r.amount, 0),
        };
    };

    return { sendBatch, isPending };
}
