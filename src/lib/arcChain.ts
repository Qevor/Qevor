import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: [
        'https://rpc.testnet.arc.network',
        'https://rpc.blockdaemon.testnet.arc.network',
        'https://arc-testnet.drpc.org',
        'https://rpc.quicknode.testnet.arc.network',
      ],
    },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  contracts: {
    // Multicall3 — standard EVM deployment, same address on all chains
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
  testnet: true,
})

// USDC is Arc Testnet's native gas token (18 decimals).
// Multicall3's aggregate3Value sends native USDC to N addresses in one tx.
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const