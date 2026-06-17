export const ARC_TESTNET_AGENT_CHAIN = 'ARC-TESTNET';
export const MANTLE_SEPOLIA_AGENT_CHAIN = 'MANTLE-SEPOLIA';
export const MANTLE_MAINNET_AGENT_CHAIN = 'MANTLE-MAINNET';
export const MANTLE_SEPOLIA_CHAIN_ID = 5003;
export const MANTLE_MAINNET_CHAIN_ID = 5000;
export const ARC_TESTNET_CHAIN_ID = 5042002;

export function normalizeAgentChain(chain?: string | null): string {
  const value = (chain ?? '').trim().toUpperCase();
  if (
    value === 'MANTLE-MAINNET' ||
    value === 'MANTLE_MAINNET' ||
    value === 'MANTLE MAINNET' ||
    value === 'MANTLE-LIVE' ||
    value === 'MANTLE_LIVE' ||
    value === 'MAINNET' ||
    value === '5000'
  ) {
    return MANTLE_MAINNET_AGENT_CHAIN;
  }
  if (value === 'MANTLE-SEPOLIA' || value === 'MANTLE_SEPOLIA' || value === 'MANTLE' || value === '5003') {
    return MANTLE_SEPOLIA_AGENT_CHAIN;
  }
  return value || ARC_TESTNET_AGENT_CHAIN;
}

export function isMantleAgentChain(chain?: string | null): boolean {
  const normalized = normalizeAgentChain(chain);
  return normalized === MANTLE_SEPOLIA_AGENT_CHAIN || normalized === MANTLE_MAINNET_AGENT_CHAIN;
}

export function isMantleMainnetAgentChain(chain?: string | null): boolean {
  return normalizeAgentChain(chain) === MANTLE_MAINNET_AGENT_CHAIN;
}

export function isAgentChainTestnet(chain?: string | null): boolean {
  return normalizeAgentChain(chain) !== MANTLE_MAINNET_AGENT_CHAIN;
}

export function chainIdForAgentChain(chain?: string | null): number {
  const normalized = normalizeAgentChain(chain);
  if (normalized === MANTLE_MAINNET_AGENT_CHAIN) return MANTLE_MAINNET_CHAIN_ID;
  if (normalized === MANTLE_SEPOLIA_AGENT_CHAIN) return MANTLE_SEPOLIA_CHAIN_ID;
  return ARC_TESTNET_CHAIN_ID;
}

export function tokenSymbolForAgentChain(chain?: string | null): 'MNT' | 'USDC' {
  return isMantleAgentChain(chain) ? 'MNT' : 'USDC';
}

export function escrowContractAddressForAgentChain(chain?: string | null): string | undefined {
  const normalized = normalizeAgentChain(chain);
  if (normalized === MANTLE_MAINNET_AGENT_CHAIN) {
    return process.env.MANTLE_MAINNET_AGENT_ESCROW_CONTRACT_ADDRESS?.trim() || undefined;
  }
  if (normalized === MANTLE_SEPOLIA_AGENT_CHAIN) {
    return (
      process.env.MANTLE_SEPOLIA_AGENT_ESCROW_CONTRACT_ADDRESS?.trim() ||
      process.env.MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS?.trim() ||
      undefined
    );
  }
  return undefined;
}
