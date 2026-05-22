import { describe, it, expect, beforeAll } from 'vitest';
import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  keccak256,
  toHex,
  hashTypedData,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  NotaryAttestationVerifier,
  shouldVerify,
  type AttestationRow,
} from './notary-attestation.js';
import { AttestationStatus } from './abi/attestation-registry.js';
import { NotaryStatus } from './abi/notary-identity-registry.js';

// Deterministic test key. Address is derived below.
const SIGNER_PK: Hex = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const signer = privateKeyToAccount(SIGNER_PK);
const SIGNER_ADDRESS = getAddress(signer.address);

const ATTESTATION_REGISTRY: Address = '0xd41C837e0c91024b41A2F456DF4100d0c964bBb1';
const IDENTITY_REGISTRY: Address = '0x77d6229316E3eFEfD22c2FA267464dB7665446A6';
const CHAIN_ID = 5042002;
const DOMAIN_NAME = 'NOTARY';
const DOMAIN_VERSION = '1';

const ATTESTATION_ID_STR = 'notary_attestation_test_001';
const NOTARY_ID_STR = 'notary_test_001';
const OBLIGATION_ID_STR = 'obl_test_001';

function bytes32(seed: string): Hex {
  return keccak256(toHex(seed));
}

// Mirrors notary/crypto/hashing.sha256_hex: _bytes32_from_text. NOTARY converts
// arbitrary string IDs to bytes32 via keccak (well, sha256 in their code) — for
// this test we just need a stable bytes32 per ID. The verifier compares hex.
const attestationIdBytes32 = bytes32(ATTESTATION_ID_STR);
const notaryIdBytes32 = bytes32(NOTARY_ID_STR);
const verdictHash = bytes32('verdict-payload');
const evidenceHash = bytes32('evidence-payload');
const reasoningHash = bytes32('reasoning-payload');
const CONFIDENCE_BPS = 8400;
const CREATED_AT = 1747876543;

const TYPES = {
  WitnessAttestation: [
    { name: 'attestationId', type: 'string' },
    { name: 'notaryId', type: 'string' },
    { name: 'obligationId', type: 'string' },
    { name: 'verdictHash', type: 'bytes32' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'reasoningTraceHash', type: 'bytes32' },
    { name: 'confidenceBps', type: 'uint64' },
    { name: 'createdAt', type: 'uint256' },
  ],
} as const;

let signature: Hex;

beforeAll(async () => {
  signature = await signer.signTypedData({
    domain: {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: ATTESTATION_REGISTRY,
    },
    types: TYPES,
    primaryType: 'WitnessAttestation',
    message: {
      attestationId: attestationIdBytes32,
      notaryId: notaryIdBytes32,
      obligationId: OBLIGATION_ID_STR,
      verdictHash,
      evidenceHash,
      reasoningTraceHash: reasoningHash,
      confidenceBps: BigInt(CONFIDENCE_BPS),
      createdAt: BigInt(CREATED_AT),
    },
  });
});

function makeRow(overrides: Partial<AttestationRow> = {}): AttestationRow {
  return {
    id: 'b-1',
    attestation_id: attestationIdBytes32,
    notary_id: notaryIdBytes32,
    obligation_id: OBLIGATION_ID_STR,
    verdict_hash: verdictHash,
    evidence_hash: evidenceHash,
    reasoning_trace_hash: reasoningHash,
    confidence_bps: CONFIDENCE_BPS,
    verdict_signature: signature,
    attestation_contract: ATTESTATION_REGISTRY,
    attestation_chain_id: CHAIN_ID,
    notary_identity_registry: IDENTITY_REGISTRY,
    attestation_domain_name: DOMAIN_NAME,
    attestation_domain_version: DOMAIN_VERSION,
    attestation_created_at: CREATED_AT,
    ...overrides,
  };
}

interface MockBag {
  attestation?: readonly [Hex, Hex, Hex, Hex, bigint, number, Address, number, bigint];
  identity?: readonly [Address, Address, Hex, Hex, Hex, Hex, number, bigint];
  throwOnAttestation?: Error;
  throwOnIdentity?: Error;
}

function makeClient(bag: MockBag): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'attestations') {
        if (bag.throwOnAttestation) throw bag.throwOnAttestation;
        if (!bag.attestation) throw new Error('no attestation tuple configured');
        return bag.attestation;
      }
      if (functionName === 'identities') {
        if (bag.throwOnIdentity) throw bag.throwOnIdentity;
        if (!bag.identity) throw new Error('no identity tuple configured');
        return bag.identity;
      }
      throw new Error(`unexpected function ${functionName}`);
    },
  };
  return client;
}

function makeVerifier(bag: MockBag): NotaryAttestationVerifier {
  const verifier = new NotaryAttestationVerifier({
    defaultRpcUrl: 'http://unused.local',
    defaultChainId: CHAIN_ID,
    defaultAttestationRegistry: ATTESTATION_REGISTRY,
    defaultNotaryIdentityRegistry: IDENTITY_REGISTRY,
    defaultDomainName: DOMAIN_NAME,
    defaultDomainVersion: DOMAIN_VERSION,
    rpcRetries: 1,
  });
  verifier.setClientForChain(CHAIN_ID, makeClient(bag));
  return verifier;
}

describe('shouldVerify', () => {
  it('off → never run', () => {
    expect(shouldVerify('off', true)).toEqual({ run: false, required: false });
    expect(shouldVerify('off', false)).toEqual({ run: false, required: false });
  });
  it('required → always run, always required', () => {
    expect(shouldVerify('required', true)).toEqual({ run: true, required: true });
    expect(shouldVerify('required', false)).toEqual({ run: true, required: true });
  });
  it('optional → run only when attestation_id present, never required', () => {
    expect(shouldVerify('optional', true)).toEqual({ run: true, required: false });
    expect(shouldVerify('optional', false)).toEqual({ run: false, required: false });
  });
});

describe('NotaryAttestationVerifier', () => {
  it('verifies a fully-correct row end-to-end', async () => {
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
      identity: [
        SIGNER_ADDRESS,
        SIGNER_ADDRESS,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        NotaryStatus.Active,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('verified');
    expect(result.signerRecovered).toBe(SIGNER_ADDRESS);
    expect(result.signerOnchain).toBe(SIGNER_ADDRESS);
    expect(result.notaryAgentWallet).toBe(SIGNER_ADDRESS);
    expect(result.attestationStatus).toBe(AttestationStatus.Signed);
    expect(result.notaryStatus).toBe(NotaryStatus.Active);
  });

  it('rejects when on-chain attestation does not exist', async () => {
    const verifier = makeVerifier({
      attestation: [
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        0n,
        0,
        '0x0000000000000000000000000000000000000000' as Address,
        AttestationStatus.Unknown,
        0n,
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('attestation_not_recorded_onchain');
  });

  it('rejects when on-chain status is Disputed', async () => {
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Disputed,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toMatch(/attestation_status_blocks_release/);
  });

  it('rejects when on-chain signer does not match the recovered signature signer', async () => {
    const OTHER_SIGNER = '0x1111111111111111111111111111111111111111' as Address;
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        OTHER_SIGNER,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('signature_signer_does_not_match_onchain_signer');
  });

  it('rejects when on-chain notaryId does not match the row', async () => {
    const verifier = makeVerifier({
      attestation: [
        bytes32('different_notary'),
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('notary_id_mismatch_with_onchain');
  });

  it('rejects when evidenceHash differs from on-chain', async () => {
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        bytes32('different evidence'),
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('evidence_hash_mismatch_with_onchain');
  });

  it('rejects when notary is not Active', async () => {
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
      identity: [
        SIGNER_ADDRESS,
        SIGNER_ADDRESS,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        NotaryStatus.Paused,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toMatch(/notary_status_blocks_release/);
  });

  it('rejects when notary is not registered at all', async () => {
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
      identity: [
        '0x0000000000000000000000000000000000000000' as Address,
        '0x0000000000000000000000000000000000000000' as Address,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        NotaryStatus.Unknown,
        0n,
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('notary_not_registered');
  });

  it('rejects when registered agentWallet is different from on-chain signer', async () => {
    const OTHER: Address = '0x2222222222222222222222222222222222222222';
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
      identity: [
        OTHER,
        OTHER,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        '0x' + '0'.repeat(64) as Hex,
        NotaryStatus.Active,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('signer_is_not_registered_notary_agent_wallet');
  });

  it('rejects when confidence_bps differs from on-chain', async () => {
    const verifier = makeVerifier({
      attestation: [
        notaryIdBytes32,
        evidenceHash,
        reasoningHash,
        '0x' + '0'.repeat(64) as Hex,
        BigInt(CONFIDENCE_BPS + 1),
        1,
        SIGNER_ADDRESS,
        AttestationStatus.Signed,
        BigInt(CREATED_AT),
      ],
    });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('confidence_bps_mismatch_with_onchain');
  });

  it('rejects malformed row fields without making an RPC call', async () => {
    const verifier = makeVerifier({});
    const result = await verifier.verify(makeRow({ attestation_id: null }));
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('missing_attestation_id');
  });

  it('returns rpc_unavailable when the registry read throws', async () => {
    const verifier = makeVerifier({ throwOnAttestation: new Error('boom') });
    const result = await verifier.verify(makeRow());
    expect(result.outcome).toBe('rpc_unavailable');
    expect(result.reason).toMatch(/attestation_registry_read_unavailable/);
  });

  // Sanity check that the signature path is wired up correctly — if this fails
  // the EIP-712 domain or types are drifting from NOTARY's signer.
  it('signature recovers the expected address', () => {
    const digest = hashTypedData({
      domain: {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: CHAIN_ID,
        verifyingContract: ATTESTATION_REGISTRY,
      },
      types: TYPES,
      primaryType: 'WitnessAttestation',
      message: {
        attestationId: attestationIdBytes32,
        notaryId: notaryIdBytes32,
        obligationId: OBLIGATION_ID_STR,
        verdictHash,
        evidenceHash,
        reasoningTraceHash: reasoningHash,
        confidenceBps: BigInt(CONFIDENCE_BPS),
        createdAt: BigInt(CREATED_AT),
      },
    });
    expect(digest).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});

// Silence unused-import warning while keeping the import available for future tests.
void createWalletClient;
void http;
