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

export const mantleMainnet = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Mantle Explorer', url: 'https://explorer.mantle.xyz' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
  testnet: false,
})

export type QevorChainKey = 'arc-testnet' | 'mantle-sepolia' | 'mantle-mainnet'
export type QevorChainEnvironment = 'testnet' | 'mainnet'

export interface QevorChainConfig {
  key: QevorChainKey
  environment: QevorChainEnvironment
  chain: Chain
  label: string
  paymentAsset: string
  agentChainCode: 'ARC-TESTNET' | 'MANTLE-SEPOLIA' | 'MANTLE-MAINNET'
  explorerUrl: string
  rpcUrls: readonly string[]
  agentEscrowAddress?: `0x${string}`
}

function optionalAddress(value?: string): `0x${string}` | undefined {
  const trimmed = value?.trim()
  return trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed as `0x${string}` : undefined
}

const mantleMainnetEscrowAddress = optionalAddress(import.meta.env.VITE_MANTLE_MAINNET_AGENT_ESCROW_ADDRESS)

export const qevorChains = [
  {
    key: 'arc-testnet',
    environment: 'testnet',
    chain: arcTestnet,
    label: 'Arc Testnet',
    paymentAsset: 'USDC',
    agentChainCode: 'ARC-TESTNET',
    explorerUrl: 'https://testnet.arcscan.app',
    rpcUrls: arcTestnet.rpcUrls.default.http,
  },
  {
    key: 'mantle-sepolia',
    environment: 'testnet',
    chain: mantleSepolia,
    label: 'Mantle Sepolia',
    paymentAsset: 'MNT',
    agentChainCode: 'MANTLE-SEPOLIA',
    explorerUrl: 'https://explorer.sepolia.mantle.xyz',
    rpcUrls: mantleSepolia.rpcUrls.default.http,
    agentEscrowAddress: '0xf0e6f301D2036b0A0c94808dc945ed764e5a35c4',
  },
  {
    key: 'mantle-mainnet',
    environment: 'mainnet',
    chain: mantleMainnet,
    label: 'Mantle Mainnet',
    paymentAsset: 'MNT',
    agentChainCode: 'MANTLE-MAINNET',
    explorerUrl: 'https://explorer.mantle.xyz',
    rpcUrls: mantleMainnet.rpcUrls.default.http,
    agentEscrowAddress: mantleMainnetEscrowAddress,
  },
] as const satisfies readonly QevorChainConfig[]

export const DEFAULT_QEVOR_CHAIN_ENVIRONMENT: QevorChainEnvironment = 'mainnet'
export const DEFAULT_QEVOR_CHAIN_KEY: QevorChainKey = 'mantle-mainnet'
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

function getDefaultQevorChain() {
  return qevorChains.find(c => c.key === DEFAULT_QEVOR_CHAIN_KEY) ?? qevorChains[0]
}

export function getQevorChainByKey(key?: string | null) {
  return qevorChains.find(c => c.key === key) ?? getDefaultQevorChain()
}

export function getQevorChainById(chainId?: number | null) {
  return qevorChains.find(c => c.chain.id === chainId) ?? getDefaultQevorChain()
}

export function getQevorChainByAgentChain(agentChain?: string | null) {
  return qevorChains.find(c => c.agentChainCode === agentChain) ?? getDefaultQevorChain()
}

export function getQevorChainEnvironment(key?: string | null): QevorChainEnvironment {
  return getQevorChainByKey(key).environment
}

export function getQevorChainsByEnvironment(environment: QevorChainEnvironment) {
  return qevorChains.filter(c => c.environment === environment)
}

export function getDefaultQevorChainForEnvironment(environment: QevorChainEnvironment) {
  if (environment === 'mainnet') return getQevorChainByKey('mantle-mainnet')
  return getQevorChainByKey('mantle-sepolia')
}

export function getExplorerTxUrl(chainId: number | null | undefined, txHash: string) {
  const network = getQevorChainById(chainId)
  return `${network.explorerUrl}/tx/${txHash}`
}
