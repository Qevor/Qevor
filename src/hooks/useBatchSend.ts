import { useWriteContract, usePublicClient } from 'wagmi';
import { parseUnits, parseGwei } from 'viem';
import { arcTestnet, MULTICALL3_ADDRESS } from '@/lib/arcChain';

// Multicall3 ABI — only the payable aggregate3Value function needed for batch sends.
// aggregate3Value forwards msg.value across calls, so N recipients = 1 transaction.
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
    amount: number; // human-readable USDC, e.g. 0.5
}

export interface BatchSendResult {
    txHash: string;
    totalSent: number;
}

export function useBatchSend() {
    const { writeContractAsync, isPending } = useWriteContract();
    const publicClient = usePublicClient({ chainId: arcTestnet.id });

    /**
     * Sends USDC to multiple recipients in a single on-chain transaction.
     * One wallet confirmation. One gas fee.
     *
     * Arc Testnet uses USDC as its native gas token (18 decimals), so each
     * recipient transfer is a plain value-bearing call with empty callData.
     * Multicall3's aggregate3Value batches all of these into one tx.
     */
    const sendBatch = async (recipients: BatchSendRecipient[]): Promise<BatchSendResult> => {
        if (recipients.length === 0) throw new Error('No recipients');

        const calls = recipients.map(r => ({
            target:       r.wallet,
            allowFailure: false,
            value:        parseUnits(r.amount.toString(), 18), // native USDC = 18 decimals
            callData:     '0x' as `0x${string}`,
        }));

        const totalValue = calls.reduce((sum, c) => sum + c.value, 0n);

        const txHash = await writeContractAsync({
            address:              MULTICALL3_ADDRESS,
            abi:                  multicall3Abi,
            functionName:         'aggregate3Value',
            args:                 [calls],
            value:                totalValue,
            chain:                arcTestnet,
            maxFeePerGas:         parseGwei('160'),
            maxPriorityFeePerGas: parseGwei('160'),
        });

        // Wait for on-chain confirmation before returning
        await publicClient!.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

        return {
            txHash,
            totalSent: recipients.reduce((s, r) => s + r.amount, 0),
        };
    };

    return { sendBatch, isPending };
}
