// Minimal read-side ABI for NOTARY's NotaryIdentityRegistry contract.
// Source: contracts/NotaryIdentityRegistry.sol in the NOTARY repo.
//
// The public `identities(bytes32)` getter returns the fields of struct
// NotaryIdentity in declaration order:
//   agentWallet, treasury, capabilitiesHash, operatingAgreementHash,
//   accountabilityPolicyHash, privacyPolicyHash, status, createdAt
//
// `status` is an enum (uint8):
//   0 Unknown | 1 Active | 2 Paused | 3 Retired
// A valid release MUST see status == 1 (Active).

export const NOTARY_IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'identities',
    stateMutability: 'view',
    inputs: [{ name: 'notaryId', type: 'bytes32' }],
    outputs: [
      { name: 'agentWallet', type: 'address' },
      { name: 'treasury', type: 'address' },
      { name: 'capabilitiesHash', type: 'bytes32' },
      { name: 'operatingAgreementHash', type: 'bytes32' },
      { name: 'accountabilityPolicyHash', type: 'bytes32' },
      { name: 'privacyPolicyHash', type: 'bytes32' },
      { name: 'status', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
] as const;

export enum NotaryStatus {
  Unknown = 0,
  Active = 1,
  Paused = 2,
  Retired = 3,
}
