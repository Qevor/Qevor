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
