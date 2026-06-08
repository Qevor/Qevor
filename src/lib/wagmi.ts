import { http, createConfig, fallback } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { arcTestnet, mantleSepolia } from './chains'

export const config = createConfig({
  chains: [arcTestnet, mantleSepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [arcTestnet.id]: fallback([
      http('https://rpc.testnet.arc.network'),
      http('https://rpc.blockdaemon.testnet.arc.network'),
      http('https://arc-testnet.drpc.org'),
      http('https://rpc.quicknode.testnet.arc.network'),
    ]),
    [mantleSepolia.id]: fallback([
      http('https://rpc.sepolia.mantle.xyz'),
      http('https://mantle-sepolia.drpc.org'),
    ]),
  },
})
