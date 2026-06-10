export const ARC_TESTNET_AGENT_CHAIN = 'ARC-TESTNET';
export const MANTLE_SEPOLIA_AGENT_CHAIN = 'MANTLE-SEPOLIA';
export const MANTLE_SEPOLIA_CHAIN_ID = 5003;

export function normalizeAgentChain(chain?: string | null): string {
  const value = (chain ?? '').trim().toUpperCase();
  if (value === 'MANTLE-SEPOLIA' || value === 'MANTLE_SEPOLIA' || value === 'MANTLE' || value === '5003') {
    return MANTLE_SEPOLIA_AGENT_CHAIN;
  }
  return value || ARC_TESTNET_AGENT_CHAIN;
}

export function isMantleAgentChain(chain?: string | null): boolean {
  return normalizeAgentChain(chain) === MANTLE_SEPOLIA_AGENT_CHAIN;
}
