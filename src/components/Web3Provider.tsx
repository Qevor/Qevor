import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '@/lib/wagmi'
import { type ReactNode, useState } from 'react'

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { arcTestnet } from '@/lib/arcChain';

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <DynamicContextProvider
      settings={{
        environmentId: import.meta.env.VITE_DYNAMIC_ENV_ID as string || "eb7686e3-4076-472e-9112-a60b20502173",
        walletConnectors: [EthereumWalletConnectors],
        walletsFilter: () => [], // Hides external wallets, forcing email-based embedded smart wallets
        overrides: {
          evmNetworks: [{
            blockExplorerUrls: ['https://testnet.arcscan.app'],
            chainId: 4242,
            iconUrls: ['https://rpc.testnet.arc.network/favicon.ico'],
            name: 'Arc Testnet',
            nativeCurrency: { decimals: 18, name: 'Arc', symbol: 'ARC' },
            networkId: 4242,
            rpcUrls: ['https://rpc.testnet.arc.network'],
          }]
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <DynamicWagmiConnector>
            {children}
          </DynamicWagmiConnector>
        </WagmiProvider>
      </QueryClientProvider>
    </DynamicContextProvider>
  )
}
