import { defineChain, type Chain } from 'viem'

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
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
  testnet: true,
})

export const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia.mantle.xyz', 'https://mantle-sepolia.drpc.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Mantle Sepolia Explorer', url: 'https://explorer.sepolia.mantle.xyz' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
  testnet: true,
})

export type QevorChainKey = 'arc-testnet' | 'mantle-sepolia'

export interface QevorChainConfig {
  key: QevorChainKey
  chain: Chain
  label: string
  paymentAsset: string
  explorerUrl: string
  rpcUrls: readonly string[]
}

export const qevorChains = [
  {
    key: 'arc-testnet',
    chain: arcTestnet,
    label: 'Arc Testnet',
    paymentAsset: 'USDC',
    explorerUrl: 'https://testnet.arcscan.app',
    rpcUrls: arcTestnet.rpcUrls.default.http,
  },
  {
    key: 'mantle-sepolia',
    chain: mantleSepolia,
    label: 'Mantle Sepolia',
    paymentAsset: 'MNT',
    explorerUrl: 'https://explorer.sepolia.mantle.xyz',
    rpcUrls: mantleSepolia.rpcUrls.default.http,
  },
] as const satisfies readonly QevorChainConfig[]

export const DEFAULT_QEVOR_CHAIN_KEY: QevorChainKey = 'arc-testnet'
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

export function getQevorChainByKey(key?: string | null) {
  return qevorChains.find(c => c.key === key) ?? qevorChains[0]
}

export function getQevorChainById(chainId?: number | null) {
  return qevorChains.find(c => c.chain.id === chainId) ?? qevorChains[0]
}

export function getExplorerTxUrl(chainId: number | null | undefined, txHash: string) {
  const network = getQevorChainById(chainId)
  return `${network.explorerUrl}/tx/${txHash}`
}
