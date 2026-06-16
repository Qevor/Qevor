# Qevor

Qevor is an agent-first, multi-chain payment workspace for teams, communities, and autonomous agents. It lets users create payment links, send wallet transfers, import CSV batch payouts, review transaction history, and route payment operations through an AI safety copilot before funds move.

Qevor currently supports Mantle Sepolia and Arc Testnet, with mainnet deployment intended to sit behind stronger policy, approval, and treasury controls.

## Product Focus

- **Agent-first payments:** users describe a payout goal and Qevor prepares a reviewable operation plan.
- **Human approval by default:** the copilot can draft, validate, and route payments, but it cannot bypass approval gates.
- **Mantle payment rail:** Mantle Sepolia MNT transfers, CSV batch payouts, receipts, and explorer links.
- **Payment links:** shareable requests for exact amounts across supported rails.
- **Wallet history:** recent direct sends, payment links, batch requests, receipts, and batch payouts are visible from the wallet dashboard.
- **AI safety copilot:** scans payment drafts for duplicate recipients, invalid addresses, risky amounts, wrong-chain intent, and suspicious CSV rows.
- **Agent operation history:** agent-assisted batches are recorded with status, recipients, amounts, and receipt access.
- **Byreal-compatible execution preflight:** Qevor calls a Mantle adapter before agent execution so external agent tooling can approve or block risky operations.
- **Escrow-backed agent execution:** `QevorAgentEscrow` provides the Mantle contract surface for policy-controlled agentic payment execution, with balances scoped per user wallet.
- **ERC-8004 identity path:** agent activity can be linked to an ERC-8004 identity by registering the agent and setting the identity on the escrow contract.

## Architecture

Qevor is split into three main layers:

1. **Frontend app:** React, TypeScript, Vite, Tailwind, Dynamic wallet auth, and the payment workspace UI.
2. **Qevor API:** Express service for copilot planning, skill endpoints, Byreal preflight, and production server functions.
3. **Executor service:** background worker that polls Supabase, checks policy, calls Byreal preflight, and executes approved agent batches.

Key docs:

- [Agent stack architecture](docs/agent-stack.md)
- [VPS deployment guide](deploy/README.md)
- [Integration notes](INTEGRATION_NOTES.md)

## Live Deployment

- **App:** [https://qevor.xyz](https://qevor.xyz)
- **API:** [https://api.qevor.xyz](https://api.qevor.xyz)
- **Mantle Sepolia escrow:** [`0xf0e6f301D2036b0A0c94808dc945ed764e5a35c4`](https://explorer.sepolia.mantle.xyz/address/0xf0e6f301D2036b0A0c94808dc945ed764e5a35c4)
- **Contract:** `contracts/QevorAgentEscrow.sol`
- **Network:** Mantle Sepolia
- **Mainnet:** not deployed yet; mainnet is intended to remain guarded behind stricter approval, policy, and treasury limits.

The deployed escrow contract is the Mantle contract that underpins Qevor's agentic payment rail. It can execute approved payments, record blocked/cosign/failed decisions, enforce replay protection, enforce per-user payment limits, and link decisions to an ERC-8004 agent identity after `setAgentIdentity(identityRegistry, agentId)` is configured. MNT sent through the escrow is accounted with `balanceOf(userWallet)`, so one user's deposit does not appear in another user's dashboard.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **UI:** Tailwind CSS, shadcn/ui, Radix UI, lucide-react
- **Wallets:** Dynamic Labs, wagmi, viem
- **Database:** Supabase
- **Agent API:** Express, Zod
- **AI copilot:** Anthropic Claude, with OpenAI fallback support
- **Execution:** Mantle Sepolia RPC, viem, optional Byreal-compatible preflight adapter
- **Contracts:** Solidity, Foundry
- **Hosting:** VPS with Caddy or any static host plus API process manager

## How Byreal Is Used

Byreal is used as Qevor's agent execution preflight layer for Mantle operations.

The official Byreal CLI is Solana-focused, so Qevor does not pretend that Byreal directly signs Mantle transfers. Instead, Qevor uses a Byreal-compatible Mantle adapter at `server/src/executor/qevor-byreal-preflight.ts`. This lets Qevor plug into the Byreal Skills / agent workflow pattern while keeping Mantle execution native and safe.

Current production configuration:

```env
BYREAL_CLI_BIN=node
BYREAL_PREFLIGHT_ARGS=/opt/qevor/server/dist/executor/qevor-byreal-preflight.js
BYREAL_SOLANA_CLI_BIN=byreal-cli
QEVOR_BYREAL_MAX_PREFLIGHT_MNT=100
QEVOR_BYREAL_REQUIRE_CLI=0
```

The flow is:

1. A user or agent asks Qevor to prepare a Mantle payment or batch.
2. Claude turns the intent into a structured Qevor payment plan.
3. Qevor policy checks run first: approval requirement, duplicate recipients, invalid addresses, amount limits, and chain checks.
4. Qevor calls the Byreal-compatible preflight adapter with JSON containing the chain, sender, recipient, amount, payment id, and policy decision.
5. The adapter returns structured JSON: `{ "allowed": true | false, "reason": "..." }`.
6. If allowed, the user still approves the transaction or the executor continues only under policy.
7. Before an agent execution signs or calls `QevorAgentEscrow`, the executor calls the same Byreal preflight again.

Byreal therefore acts as a real execution-layer gate in Qevor: it can approve, warn, or block Mantle agent operations before funds move. It does not bypass Qevor policy, user approval, or contract limits.

## Local Setup

Install dependencies:

```sh
npm install
cd server
npm install
```

Create a local frontend env file:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
VITE_DYNAMIC_ENVIRONMENT_ID=
VITE_QEVOR_API_URL=http://localhost:4000
```

Create a local API env file in `server/.env`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_COPILOT_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=
OPENAI_COPILOT_MODEL=
BYREAL_CLI_BIN=node
BYREAL_PREFLIGHT_ARGS=dist/executor/qevor-byreal-preflight.js
QEVOR_BYREAL_MAX_PREFLIGHT_MNT=100
QEVOR_BYREAL_REQUIRE_CLI=0
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
MANTLE_AGENT_PRIVATE_KEY=
MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS=
```

Run the frontend:

```sh
npm run dev
```

Run the API:

```sh
cd server
npm run dev
```

Build:

```sh
npm run build
cd server
npm run build
```

## Supabase

Qevor stores product and audit data in Supabase. Run the migrations in `supabase/migrations/` before using payment links, receipts, batch payouts, agent wallets, and wallet history.

Core tables include:

- `profiles`
- `payment_links`
- `batch_requests`
- `batch_payments`
- `receipts`
- `agent_wallets`
- `agent_policies`
- `agent_audit_log`
- `agent_cosign_queue`

## Mantle Agent Contract

The Mantle agent rail is backed by `contracts/QevorAgentEscrow.sol`.

The escrow can be shared across users safely because deposits and spends are keyed by the connected wallet:

- `depositFor(userWallet)` credits only that user's agent balance.
- `balanceOf(userWallet)` is what the dashboard displays.
- `executePayment(paymentId, userWallet, recipient, amount)` can only debit that user's scoped balance.
- Daily spend tracking is also per user wallet.

Deployed Mantle Sepolia contract:

```txt
0xf0e6f301D2036b0A0c94808dc945ed764e5a35c4
```

Explorer:

```txt
https://explorer.sepolia.mantle.xyz/address/0xf0e6f301D2036b0A0c94808dc945ed764e5a35c4
```

Compile:

```sh
forge build
```

Deploy to Mantle Sepolia:

```sh
forge create contracts/QevorAgentEscrow.sol:QevorAgentEscrow \
  --rpc-url "$MANTLE_SEPOLIA_RPC_URL" \
  --private-key "$MANTLE_AGENT_PRIVATE_KEY" \
  --constructor-args "$MANTLE_ESCROW_EXECUTOR_ADDRESS" "$MANTLE_ESCROW_MAX_PAYMENT_WEI" "$MANTLE_ESCROW_DAILY_LIMIT_WEI"
```

After deployment:

1. Fund the escrow with test MNT through `depositFor(userWallet)` or from the connected wallet.
2. Configure `MANTLE_AGENT_ESCROW_CONTRACT_ADDRESS`.
3. Register the escrow address as the Mantle agent wallet in Qevor.
4. Optionally connect the deployed agent to an ERC-8004 identity.
5. Restart the API and executor.

## Agent Skill API

External agents can integrate with Qevor through the protected skill API:

- `GET /.well-known/qevor-agent-skills.json`
- `POST /api/skills/payment-safety-review`
- `POST /api/skills/batch-payment`

Skill requests require:

```http
x-qevor-agent-key: <server configured key>
```

## Deployment

Qevor can run without Vercel. The current production path is:

- `qevor.xyz` for the frontend
- `api.qevor.xyz` for the API
- Supabase for database persistence
- PM2 for `qevor-api` and `qevor-executor`
- Caddy or Nginx for HTTPS and reverse proxying

See [deploy/README.md](deploy/README.md) for the VPS runbook.

## Safety Notes

- Never commit private keys, API keys, Supabase service role keys, or executor secrets.
- Mainnet should remain guarded by stricter limits, allowlists, daily caps, and human approval.
- Agent execution must always pass policy checks and Byreal-compatible preflight before signing.
- The copilot prepares plans; it does not directly move funds.
