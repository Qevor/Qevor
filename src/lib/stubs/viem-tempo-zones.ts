// Stub for viem/tempo, viem/tempo/zones, ox/tempo, @wagmi/core/tempo, wagmi/tempo
// wagmi@3.6 references these but viem@2.47 doesn't export them yet.
// This prevents the Vite build from crashing. Tempo zone features are not used in Qevor.

export const Abis = {};
export const Actions = {};
export const ZoneAbis = {};
export const TokenId = {};

// Re-export everything wagmi/tempo might need
export const tempoWallet = () => ({});
export const dangerous_secp256k1 = {};
export const webAuthn = {};
export const Hooks = {};

export default {};
