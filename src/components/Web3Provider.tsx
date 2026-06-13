import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '@/lib/wagmi'
import { type ReactNode, useState } from 'react'

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { qevorChains } from '@/lib/chains';

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const dynamicEnvironmentId =
    (import.meta.env.VITE_DYNAMIC_ENV_ID as string | undefined) ||
    "eb7686e3-4076-472e-9112-a60b20502173";
  const emailOnlyAuth = import.meta.env.VITE_DYNAMIC_EMAIL_ONLY === 'true';

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
        ...(emailOnlyAuth ? { walletsFilter: () => [] } : {}),
        overrides: {
          evmNetworks: qevorChains.map(network => ({
            blockExplorerUrls: [network.explorerUrl],
            chainId: network.chain.id,
            iconUrls: [],
            name: network.label,
            nativeCurrency: network.chain.nativeCurrency,
            networkId: network.chain.id,
            rpcUrls: [...network.rpcUrls],
          })),
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
