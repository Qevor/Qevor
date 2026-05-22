// Minimal read-side ABI for NOTARY's AttestationRegistry contract.
// Source: contracts/AttestationRegistry.sol in the NOTARY repo.
//
// Storage layout for the public `attestations(bytes32)` getter returns the
// fields of struct AttestationRecord in declaration order:
//   notaryId, evidenceHash, reasoningTraceHash, disclosurePolicyHash,
//   confidenceBps, privacyMode, signer, status, createdAt
//
// `status` is an enum (uint8):
//   0 Unknown | 1 Signed | 2 Submitted | 3 Disputed | 4 Resolved | 5 Rejected
// A valid release MUST see status == 1 (Signed). Disputed/Rejected blocks.

export const ATTESTATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'attestations',
    stateMutability: 'view',
    inputs: [{ name: 'attestationId', type: 'bytes32' }],
    outputs: [
      { name: 'notaryId', type: 'bytes32' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'reasoningTraceHash', type: 'bytes32' },
      { name: 'disclosurePolicyHash', type: 'bytes32' },
      { name: 'confidenceBps', type: 'uint64' },
      { name: 'privacyMode', type: 'uint8' },
      { name: 'signer', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
] as const;

export enum AttestationStatus {
  Unknown = 0,
  Signed = 1,
  Submitted = 2,
  Disputed = 3,
  Resolved = 4,
  Rejected = 5,
}
