# Integration Notes — Qevor Agent Stack

Written before any code changes, per §9 step 2.

## Codebase Summary

### Stack
- **Frontend**: React 18.3.1, TypeScript 5.8.3, Vite, Tailwind 3.4, shadcn/ui (Radix + lucide-react)
- **Web3**: wagmi 3.5, viem 2.48, Dynamic Labs SDK 4.77, Circle App Kit 1.4.1
- **State**: React Query 5.83, Valtio 2.3, React Hook Form 7.61, Zod 3.25
- **Backend**: Supabase (anon key client-side), no server process today
- **Package manager**: npm (bun.lock present but npm scripts canonical)
- **Network**: Arc Testnet (chain ID 5042002), USDC is native gas token (18 decimals)

### Key Files
| File | Purpose |
|------|---------|
| `src/App.tsx` | Routes: `/`, `/create`, `/pay`, `/receipt/:id`, `/send`, `/dashboard`, `/request/:id` |
| `src/components/Web3Provider.tsx` | Dynamic Labs + Wagmi + React Query providers |
| `src/lib/arcChain.ts` | Arc Testnet chain definition (ID 5042002, explorer: testnet.arcscan.app) |
| `src/lib/contracts.ts` | ERC-20 ABI, USDC address `0x3600000000000000000000000000000000000000` |
| `src/hooks/useBatchSend.ts` | Multicall3 batch send (aggregate3Value) |
| `src/hooks/useBatchPayments.ts` | Supabase CRUD for batch_requests/batch_payments |
| `src/hooks/useProfiles.ts` | Username registration and resolution |
| `src/hooks/usePaymentLinks.ts` | Payment link CRUD |
| `src/hooks/useReceipts.ts` | Receipt creation and fetching |
| `supabase/migrations/01_qevor_schema.sql` | Schema: payment_links, receipts, batch_requests, batch_payments |

### Existing Tables (from migration)
- `payment_links` (id, receiver_wallet, amount, expires_at, max_uses, current_uses, group_id, created_at)
- `receipts` (id, sender, receiver, amount, tx_hash, status, memo, created_at)
- `batch_requests` (id, creator_wallet, title, description, recipients jsonb, total_amount, status, expires_at, created_at)
- `batch_payments` (id, batch_request_id, payer_wallet, recipient_wallet, amount, tx_hash, status, created_at)
- `profiles` — referenced in code but NOT in migration file. Expected columns: wallet, username, created_at.

### Notable Patterns
- No RLS policies defined in existing migration
- No server-side process — pure SPA with Supabase client
- Supabase client uses `any` for types (auto-generated types file is empty scaffold)
- USDC on Arc Testnet is native currency (18 decimals), not an ERC-20
- Batch send uses Multicall3 aggregate3Value for atomic multi-transfer
- `tsconfig.json`: `noImplicitAny: false`, `strictNullChecks: false`

## Circle CLI Reference (from docs)

### Package
`npm install -g @circle-fin/cli` (package: `@circle-fin/cli`)

### Chain Identifier
Arc Testnet: `ARC-TESTNET` (confirmed from supported-blockchains doc)

### Key Commands Used in This Integration

```bash
# Authentication (two-step for scripts/AI agents)
circle wallet login <email> --testnet --init          # returns request ID
circle wallet login --request <id> --otp <code>       # completes auth

# Session check
circle wallet status --type agent --output json

# Wallet creation (max 5 agent wallets per user)
circle wallet create --type agent --testnet --idempotency-key <uuid>

# List wallets
circle wallet list --chain ARC-TESTNET --type agent --output json

# Balance
circle wallet balance --address <addr> --chain ARC-TESTNET --output json

# Transfer
circle wallet transfer <toAddress> --amount <amount> --address <fromAddr> --chain ARC-TESTNET --output json
# Note: --token flag omitted = USDC default. --idempotency-key not listed as a flag in transfer docs.
# TODO: Verify if circle wallet transfer supports --idempotency-key flag.

# Fund (testnet faucet)
circle wallet fund --address <addr> --chain ARC-TESTNET

# Spending limits (mainnet only)
circle wallet limit set --address <addr> --chain <chain> --policy-type stablecoin \
  --per-tx <n> --daily <n> --weekly <n> --monthly <n>
circle wallet limit set --address <addr> --chain <chain> --policy-type stablecoin \
  --rule-type recipient-allowlist --targets "[0xA,0xB]"

# Blockchain info
circle blockchain list
circle blockchain config --chain ARC-TESTNET --output json
circle contract address usdc --chain ARC-TESTNET --output json

# Terms
circle terms accept

# Logout
circle wallet logout
```

### Discrepancies & TODOs

1. **TODO**: `circle wallet transfer` — the brief specifies `--idempotency-key` but the CLI command reference does not list this flag for `transfer`. Need to verify. Conservative interpretation: if not supported, use a wrapper that checks audit_log before re-executing.
2. **TODO**: `circle blockchain config --chain ARC-TESTNET --output json` — verify this returns an explorer URL. The codebase already has `https://testnet.arcscan.app` in `arcChain.ts`.
3. **TODO**: `circle contract address usdc --chain ARC-TESTNET` — verify output. Codebase has `0x3600000000000000000000000000000000000000` but this may be the native token address, not an ERC-20 contract (USDC is native on Arc Testnet).
4. **TODO**: Delegation (Option B in §2.2) — Circle docs do not document delegated agent permissions. Ship Option A (escrow) only.
5. **TODO**: `circle wallet limit set` is mainnet only. Testnet enforcement is Qevor policy engine only.
6. **profiles table** — not in migration. Must verify it exists in Supabase before adding FK references. The `agent_wallets` table references `profiles(id)` so we need the profiles table to have an `id uuid` PK.

### Explorer URL
Arc Testnet: `https://testnet.arcscan.app` (from `src/lib/arcChain.ts`)
Transaction link pattern: `https://testnet.arcscan.app/tx/<hash>` (to verify)

### USDC on Arc Testnet
USDC is the **native gas token** (18 decimals). Address `0x3600000000000000000000000000000000000000` is in contracts.ts but may represent the native token wrapper. Circle CLI `circle wallet transfer` without `--token` defaults to USDC.

### Session Renewal Cadence
Circle CLI sessions expire after 7 days. The executor must detect expiry and the operator must re-run the two-step OTP login.

### Fees
- Gas: fully sponsored by Circle (subject to fair use)
- Same-chain USDC transfers: free
- CCTP bridging: variable fees
- Swaps: 2 bps

---

## NOTARY Attestation Gating (added 2026-05-22)

NOTARY is a separate AI agent that runs the **Witness Pipeline** (Intake →
Verify → Judge → Attest → Pay → Learn). It produces signed EIP-712 verdicts
on-chain (Arc) and instructs Qevor to release payment only after a verdict
has been recorded.

This integration makes Qevor's executor refuse to release funds for a batch
unless it can verify the NOTARY attestation on-chain. Existing
direct-from-app batch flows (no attestation) keep working — verification is
gated per-wallet by `agent_wallets.attestation_mode`.

### Contract Boundary

NOTARY publishes two upstream contracts on Arc Testnet:

| Contract | Purpose | Reader |
|----------|---------|--------|
| `AttestationRegistry` | Stores `(attestationId → notaryId, evidenceHash, reasoningTraceHash, confidenceBps, signer, status)` | `server/src/lib/abi/attestation-registry.ts` |
| `NotaryIdentityRegistry` | Stores `(notaryId → agentWallet, status, ...)` | `server/src/lib/abi/notary-identity-registry.ts` |

We read both via viem (no writes). NOTARY's deploy script writes the
addresses; we receive them via env (`NOTARY_ATTESTATION_REGISTRY`,
`NOTARY_IDENTITY_REGISTRY`).

### Bidirectional Wire

**NOTARY → Qevor (intake):** NOTARY's `qevorpay.QevorpayClient` inserts
into `batch_requests` with `executor_state='pending_evaluation'` plus the
attestation fields documented in migration 03. The unique index on
`attestation_id` provides replay protection.

**Qevor → NOTARY (settlement):** Each terminal `batch_payments` row
(paid/failed/blocked/cosign_required) fires a signed webhook
(`x-signature: hmac_sha256(secret, body)`) to NOTARY's
`/webhooks/qevorpay/settlement`. Header name and secret match NOTARY's
`notary/services/qevorpay.py::verify_webhook`.

### Verification Invariants (fail-closed)

`NotaryAttestationVerifier.verify()` returns one of:

- `verified` — all 10 invariants pass; batch proceeds
- `rejected` — at least one invariant fails; batch fails terminally,
  payments marked `blocked`, audit row in `notary_verifications`
- `rpc_unavailable` — Arc RPC unreachable after retries; batch rolls back
  to `pending_evaluation` for retry (no payment lost)

The invariants:
1. AttestationRegistry returns a row for `attestationId`
2. Row status is `Signed` (1) or `Submitted` (2) (not `Disputed` /
   `Rejected` / `Resolved`)
3. Recovered EIP-712 signer matches `row.signer`
4. `row.notaryId == batch.notary_id`
5. `row.evidenceHash == batch.evidence_hash`
6. `row.reasoningTraceHash == batch.reasoning_trace_hash`
7. `row.confidenceBps == batch.confidence_bps`
8. NotaryIdentityRegistry returns a row for `notaryId`
9. Notary status is `Active` (1)
10. `notary.agentWallet == row.signer` (signer is operationally
    authorized for that notaryId)

### Backwards Compatibility

`agent_wallets.attestation_mode` defaults to `off`. Existing wallets that
predate NOTARY get the default and behave as before. NOTARY-driven wallets
should be created with `attestation_mode='required'`; mixed-mode wallets
(human + agent) can use `optional`.

### Env vars (server/.env)

```
NOTARY_ATTESTATION_REGISTRY=0x...      # AttestationRegistry contract address
NOTARY_IDENTITY_REGISTRY=0x...         # NotaryIdentityRegistry contract address
NOTARY_ARC_RPC_URL=https://rpc.testnet.arc.network
NOTARY_ARC_CHAIN_ID=5042002
NOTARY_EIP712_DOMAIN_NAME=NOTARY       # EIP-712 domain.name
NOTARY_EIP712_DOMAIN_VERSION=1         # EIP-712 domain.version
NOTARY_RPC_TIMEOUT_MS=8000             # per-call Arc RPC timeout
NOTARY_RPC_RETRIES=2                   # transient-error retries
NOTARY_WEBHOOK_URL=                    # https://notary.example/webhooks/qevorpay/settlement
NOTARY_WEBHOOK_SECRET=                 # shared HMAC secret (matches NOTARY's QEVORPAY_WEBHOOK_SECRET)
NOTARY_WEBHOOK_SIGNATURE_HEADER=x-signature
NOTARY_WEBHOOK_TIMEOUT_MS=10000        # outbound webhook timeout
```

If `NOTARY_*_REGISTRY` is unset, the verifier short-circuits to
`rpc_unavailable` so a misconfigured deploy fails closed rather than open.

### Testing

```bash
cd server
npm install
npm test           # 22 tests across notary-attestation + notary-webhook
npm run typecheck
```

The verifier tests use a deterministic test key
(`0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`,
address `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` — Anvil account 1) and
sign real EIP-712 payloads; viem clients are mocked at the
`readContract` boundary.
