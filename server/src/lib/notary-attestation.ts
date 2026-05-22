// Verifies that a batch_requests row was authorized by a signed NOTARY verdict
// recorded on Arc. Fail-closed at every step.
//
// The verifier returns one of three outcomes:
//   - verified         — release is authorized; safe to proceed to policy eval.
//   - rejected         — terminal: signature, signer, status, or notary identity
//                        did not check out. Block this batch permanently.
//   - rpc_unavailable  — Arc RPC failed after retries; do not pay yet, but do
//                        not write the batch off either. Caller retries on the
//                        next executor tick.
//
// Every call appends a row to notary_verifications for auditability.

import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  isAddress,
  getAddress,
  recoverTypedDataAddress,
  hexToBigInt,
  isHex,
} from 'viem';
import type { Logger } from 'pino';
import {
  ATTESTATION_REGISTRY_ABI,
  AttestationStatus,
} from './abi/attestation-registry.js';
import {
  NOTARY_IDENTITY_REGISTRY_ABI,
  NotaryStatus,
} from './abi/notary-identity-registry.js';

// Row shape this module needs from batch_requests. Kept narrow on purpose so
// callers don't accidentally pass mutable fields.
export interface AttestationRow {
  id: string;
  attestation_id: string | null;
  notary_id: string | null;
  obligation_id: string | null;
  verdict_hash: string | null;
  evidence_hash: string | null;
  reasoning_trace_hash: string | null;
  confidence_bps: number | null;
  verdict_signature: string | null;
  attestation_contract: string | null;
  attestation_chain_id: number | null;
  notary_identity_registry: string | null;
  attestation_domain_name: string | null;
  attestation_domain_version: string | null;
  attestation_created_at: number | null;
}

export interface AttestationMode {
  attestation_mode: 'off' | 'optional' | 'required';
}

export type VerificationOutcome = 'verified' | 'rejected' | 'rpc_unavailable';

export interface VerificationResult {
  outcome: VerificationOutcome;
  reason?: string;
  signerRecovered?: Address;
  signerOnchain?: Address;
  notaryAgentWallet?: Address;
  notaryStatus?: NotaryStatus;
  attestationStatus?: AttestationStatus;
  confidenceBpsOnchain?: number;
}

export interface VerifierConfig {
  defaultRpcUrl?: string;
  defaultChainId?: number;
  defaultAttestationRegistry?: string;
  defaultNotaryIdentityRegistry?: string;
  defaultDomainName?: string;
  defaultDomainVersion?: string;
  rpcTimeoutMs?: number;
  rpcRetries?: number;
}

// EIP-712 typed-data shape that NOTARY signs. Must match exactly
// notary/witness_pipeline.py: WitnessAttestation typed data, or signature
// recovery will not match the on-chain signer.
const WITNESS_ATTESTATION_TYPES = {
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

function requiredHex32(value: string | null, field: string): Hex {
  if (!value) throw new VerifierRejected(`missing_${field}`);
  let normalized = value.trim();
  if (!normalized.startsWith('0x')) normalized = `0x${normalized}`;
  if (!isHex(normalized) || normalized.length !== 66) {
    throw new VerifierRejected(`bad_${field}_hex`);
  }
  return normalized.toLowerCase() as Hex;
}

function requiredAddress(value: string | null, field: string): Address {
  if (!value || !isAddress(value)) throw new VerifierRejected(`bad_${field}_address`);
  return getAddress(value);
}

function requiredString(value: string | null, field: string): string {
  if (!value || !value.length) throw new VerifierRejected(`missing_${field}`);
  return value;
}

class VerifierRejected extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

class VerifierRpcUnavailable extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export class NotaryAttestationVerifier {
  private clients = new Map<string, PublicClient>();

  constructor(private readonly cfg: VerifierConfig) {}

  /**
   * Verify a batch_requests row. Does not mutate the row; caller is responsible
   * for translating the outcome into status updates and audit-log writes.
   */
  async verify(
    row: AttestationRow,
    log?: Logger,
  ): Promise<VerificationResult> {
    try {
      return await this.verifyImpl(row, log);
    } catch (err) {
      if (err instanceof VerifierRejected) {
        return { outcome: 'rejected', reason: err.reason };
      }
      if (err instanceof VerifierRpcUnavailable) {
        return { outcome: 'rpc_unavailable', reason: err.reason };
      }
      // Unknown failure — treat as RPC unavailable so we don't lose the row.
      // We choose unavailable over rejected because we cannot distinguish a bug
      // in our code from a malformed-but-otherwise-legitimate verdict.
      const msg = err instanceof Error ? err.message : String(err);
      log?.error({ err: msg }, 'attestation verifier threw unexpected error');
      return { outcome: 'rpc_unavailable', reason: 'verifier_internal_error' };
    }
  }

  private async verifyImpl(
    row: AttestationRow,
    log?: Logger,
  ): Promise<VerificationResult> {
    // 1. Pull mandatory fields. Anything missing → rejected, not unavailable.
    const attestationId = requiredHex32(row.attestation_id, 'attestation_id');
    const notaryId = requiredHex32(row.notary_id, 'notary_id');
    const verdictHash = requiredHex32(row.verdict_hash, 'verdict_hash');
    const evidenceHash = requiredHex32(row.evidence_hash, 'evidence_hash');
    const reasoningHash = requiredHex32(
      row.reasoning_trace_hash,
      'reasoning_trace_hash',
    );
    const signature = (() => {
      const sig = requiredString(row.verdict_signature, 'verdict_signature').trim();
      const normalized = sig.startsWith('0x') ? sig : `0x${sig}`;
      if (!isHex(normalized) || normalized.length !== 132) {
        throw new VerifierRejected('bad_verdict_signature_hex');
      }
      return normalized.toLowerCase() as Hex;
    })();
    const attestationContract = requiredAddress(
      row.attestation_contract ?? this.cfg.defaultAttestationRegistry ?? null,
      'attestation_contract',
    );
    const identityRegistry = requiredAddress(
      row.notary_identity_registry ?? this.cfg.defaultNotaryIdentityRegistry ?? null,
      'notary_identity_registry',
    );
    const chainId = row.attestation_chain_id ?? this.cfg.defaultChainId;
    if (!chainId || chainId <= 0) throw new VerifierRejected('missing_chain_id');
    const domainName =
      row.attestation_domain_name ?? this.cfg.defaultDomainName ?? null;
    const domainVersion =
      row.attestation_domain_version ?? this.cfg.defaultDomainVersion ?? null;
    if (!domainName) throw new VerifierRejected('missing_domain_name');
    if (!domainVersion) throw new VerifierRejected('missing_domain_version');
    if (row.attestation_created_at == null || row.attestation_created_at <= 0) {
      throw new VerifierRejected('missing_attestation_created_at');
    }
    if (row.confidence_bps == null || row.confidence_bps < 0 || row.confidence_bps > 10_000) {
      throw new VerifierRejected('bad_confidence_bps');
    }
    const obligationId = requiredString(row.obligation_id, 'obligation_id');

    const client = this.clientFor(chainId);

    // 2. Read AttestationRegistry. RPC failure here is "unavailable", not "rejected".
    type AttestationTuple = readonly [
      Hex, // notaryId
      Hex, // evidenceHash
      Hex, // reasoningTraceHash
      Hex, // disclosurePolicyHash
      bigint, // confidenceBps (uint64)
      number, // privacyMode (uint8)
      Address, // signer
      number, // status (uint8)
      bigint, // createdAt
    ];

    const onchain = await this.callWithRetries<AttestationTuple>(
      () =>
        client.readContract({
          address: attestationContract,
          abi: ATTESTATION_REGISTRY_ABI,
          functionName: 'attestations',
          args: [attestationId],
        }) as Promise<AttestationTuple>,
      'attestation_registry_read',
      log,
    );

    const [
      onchainNotaryId,
      onchainEvidenceHash,
      onchainReasoningHash,
      ,
      onchainConfidenceBps,
      ,
      onchainSigner,
      onchainStatusRaw,
    ] = onchain;

    if (onchainStatusRaw === AttestationStatus.Unknown) {
      throw new VerifierRejected('attestation_not_recorded_onchain');
    }
    if (
      onchainStatusRaw !== AttestationStatus.Signed &&
      onchainStatusRaw !== AttestationStatus.Submitted
    ) {
      // Disputed / Resolved / Rejected — do not pay against a contested record.
      throw new VerifierRejected(`attestation_status_blocks_release:${onchainStatusRaw}`);
    }
    if (onchainNotaryId.toLowerCase() !== notaryId) {
      throw new VerifierRejected('notary_id_mismatch_with_onchain');
    }
    if (onchainEvidenceHash.toLowerCase() !== evidenceHash) {
      throw new VerifierRejected('evidence_hash_mismatch_with_onchain');
    }
    if (onchainReasoningHash.toLowerCase() !== reasoningHash) {
      throw new VerifierRejected('reasoning_hash_mismatch_with_onchain');
    }
    const confidenceBpsNum = Number(onchainConfidenceBps);
    if (confidenceBpsNum !== row.confidence_bps) {
      throw new VerifierRejected('confidence_bps_mismatch_with_onchain');
    }

    // 3. Recover signer from the EIP-712 signature. The typed-data structure
    //    must match notary/witness_pipeline.py exactly.
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: domainName,
        version: domainVersion,
        chainId,
        verifyingContract: attestationContract,
      },
      types: WITNESS_ATTESTATION_TYPES,
      primaryType: 'WitnessAttestation',
      message: {
        attestationId: row.attestation_id!,
        notaryId: row.notary_id!,
        obligationId,
        verdictHash,
        evidenceHash,
        reasoningTraceHash: reasoningHash,
        confidenceBps: BigInt(row.confidence_bps),
        createdAt: BigInt(row.attestation_created_at),
      },
      signature,
    });
    const recoveredChecksum = getAddress(recovered);
    const onchainSignerChecksum = getAddress(onchainSigner);
    if (recoveredChecksum !== onchainSignerChecksum) {
      throw new VerifierRejected('signature_signer_does_not_match_onchain_signer');
    }

    // 4. Confirm the signer is the registered agentWallet of an Active notary.
    type IdentityTuple = readonly [
      Address, // agentWallet
      Address, // treasury
      Hex, // capabilitiesHash
      Hex, // operatingAgreementHash
      Hex, // accountabilityPolicyHash
      Hex, // privacyPolicyHash
      number, // status (uint8)
      bigint, // createdAt
    ];

    const identity = await this.callWithRetries<IdentityTuple>(
      () =>
        client.readContract({
          address: identityRegistry,
          abi: NOTARY_IDENTITY_REGISTRY_ABI,
          functionName: 'identities',
          args: [notaryId],
        }) as Promise<IdentityTuple>,
      'identity_registry_read',
      log,
    );
    const [identityAgentWallet, , , , , , identityStatusRaw, identityCreatedAt] = identity;

    if (identityCreatedAt === 0n) {
      throw new VerifierRejected('notary_not_registered');
    }
    if (identityStatusRaw !== NotaryStatus.Active) {
      throw new VerifierRejected(`notary_status_blocks_release:${identityStatusRaw}`);
    }
    if (getAddress(identityAgentWallet) !== onchainSignerChecksum) {
      throw new VerifierRejected('signer_is_not_registered_notary_agent_wallet');
    }

    return {
      outcome: 'verified',
      signerRecovered: recoveredChecksum,
      signerOnchain: onchainSignerChecksum,
      notaryAgentWallet: getAddress(identityAgentWallet),
      notaryStatus: identityStatusRaw,
      attestationStatus: onchainStatusRaw,
      confidenceBpsOnchain: confidenceBpsNum,
    };
  }

  private async callWithRetries<T>(
    fn: () => Promise<T>,
    operation: string,
    log?: Logger,
  ): Promise<T> {
    const max = this.cfg.rpcRetries ?? 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        log?.warn({ operation, attempt, max, err: msg }, 'attestation RPC call failed');
        if (attempt < max) {
          await sleep(150 * 2 ** (attempt - 1));
        }
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new VerifierRpcUnavailable(`${operation}_unavailable:${msg.slice(0, 120)}`);
  }

  private clientFor(chainId: number): PublicClient {
    const key = String(chainId);
    const cached = this.clients.get(key);
    if (cached) return cached;
    const url = this.cfg.defaultRpcUrl;
    if (!url) throw new VerifierRejected('missing_rpc_url_config');
    const client = createPublicClient({
      transport: http(url, { timeout: this.cfg.rpcTimeoutMs ?? 10_000 }),
    }) as PublicClient;
    this.clients.set(key, client);
    return client;
  }

  /** For tests: inject a pre-built client for a given chain. */
  setClientForChain(chainId: number, client: PublicClient): void {
    this.clients.set(String(chainId), client);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Decide whether verification should run for this row given the wallet's mode. */
export function shouldVerify(
  mode: 'off' | 'optional' | 'required',
  hasAttestationId: boolean,
): { run: boolean; required: boolean } {
  if (mode === 'off') return { run: false, required: false };
  if (mode === 'required') return { run: true, required: true };
  // optional
  return { run: hasAttestationId, required: false };
}
