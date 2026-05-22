# Qevor

A production-ready decentralized payment application for creating, sharing, and managing crypto payment links, batch requests, and seamless wallet-to-wallet transfers. Qevor is designed for the Arc Testnet.

## ✨ Features

- **Global Username System:** Maps unique usernames to wallet addresses for easier and safer payments.
- **Payment Links:** Generates shareable payment links that specify amount and receiver or group criteria.
- **Batch Requests:** Built-in dashboard for requesting and distributing batch payments to multiple recipients at once.
- **NOTARY Conditional Reserves:** Supports witness-to-pay cases where a payer's agent wallet reserves USDC in escrow before a payee starts work.
- **Unified Dashboard:** Comprehensive dashboard for tracking payment history, managing usernames, and handling batch payments.
- **Web3 Onboarding:** Seamless wallet integration leveraging Dynamic Labs and Web3 authentication.
- **Supabase Backend:** Powerful backend for storing transaction receipts, payment links, profiles, and batch requests data.

## 🛠 Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Styling:** Tailwind CSS, shadcn/ui, Radix UI, Framer Motion (Implicit via animations)
- **Web3:** wagmi, viem, Dynamic Labs SDK (@dynamic-labs/sdk-react-core), Circle Fin App Kit
- **Backend/Database:** Supabase (@supabase/supabase-js)
- **State Management:** React Query (@tanstack/react-query), valtio, React Hook Form + Zod

## 🏗 Setup & Installation

Clone the repository and install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

## 🔒 Environment Variables

Create a `.env` file in the root directory. You will need your Supabase credentials and any requisite Web3 API keys initialized in the application:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
```

## 🗄️ Database Schema

The Supabase database relies on the following core entities:
- `profiles` – Global usernames tied to wallet addresses.
- `payment_links` – Details for shareable URLs used for receiving funds.
- `batch_requests` & `batch_payments` – For handling mass disbursements and splitting payments.
- `receipts` – Immutable tracking for completed transactions.

Ensure these have been migrated in your Supabase instance (`supabase/migrations/`).

## 🚀 Deployment

Build the project for production:

```sh
npm run build
```

Deploy the resulting `dist/` folder to Vercel, Netlify, or any compatible static hosting provider.

## Agent Wallets (AI Treasurer)

Register Circle Agent Wallets as first-class Qevor primitives. Set spending policies (per-tx, daily, weekly, monthly caps, allowlists, blocklists, time-of-day, cosign thresholds) via a guided UI. Policies mirror Circle's native `wallet limit set` model on mainnet while Qevor enforces them on testnet. Every action is logged to an immutable audit trail. See [docs/agent-stack.md](docs/agent-stack.md) for architecture details.

## Autonomous Batches

Enable policy-gated autonomous batch execution via a dedicated executor service. The executor evaluates each batch line item against the wallet's policy: auto-executing approved lines, escalating cosign-threshold lines to a human approval queue, and blocking policy violations. All decisions are audit-logged with on-chain tx hashes. See [docs/agent-stack.md](docs/agent-stack.md) for the execution flow.

## NOTARY Witness-To-Pay Integration

Qevor is the payment rail for NOTARY. NOTARY judges whether an obligation was fulfilled; Qevor moves USDC and records payment execution.

The current integration has two separate executor phases:

1. **Pre-work reserve funding**
   - NOTARY creates a conditional reserve row in `batch_requests` with `executor_state = 'pending_reserve'`.
   - The row includes `notary_case_id`, `reserve_source_wallet`, `reserve_wallet`, and `reserve_amount_usdc`.
   - Qevor's executor loads the payer's enrolled `agent_wallets` row.
   - The executor evaluates the payer policy against the final payee address/username.
   - If policy allows it, Circle CLI transfers USDC from the payer agent wallet to the payer escrow wallet.
   - Qevor marks the request `reserve_funded`, marks the payment `funded`, and sends NOTARY a signed webhook with `state: funded`.

2. **Post-verdict release**
   - After NOTARY receives evidence and signs an attested verdict, it creates the normal attestation-gated batch release.
   - Qevor verifies the NOTARY EIP-712 signature and Arc attestation before moving reserved USDC to the payee.
   - If verification fails and the wallet requires attestations, the batch fails closed and no USDC moves.

This protects payees from unfunded promises while preserving Qevor's role as the only component that executes payments.

Required migrations, in order:

```sh
supabase/migrations/01_qevor_schema.sql
supabase/migrations/02_agent_stack.sql
supabase/migrations/03_notary_attestation.sql
supabase/migrations/04_conditional_reserves.sql
```

`04_conditional_reserves.sql` must be applied after `03_notary_attestation.sql`.

Qevor executor environment:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
CIRCLE_CLI_HOME=/path/to/.circle-cli
CIRCLE_ACCEPT_TERMS=1
NOTARY_ATTESTATION_REGISTRY=
NOTARY_IDENTITY_REGISTRY=
NOTARY_ARC_RPC_URL=https://rpc.testnet.arc.network
NOTARY_ARC_CHAIN_ID=5042002
NOTARY_WEBHOOK_URL=https://your-notary-domain/webhooks/qevorpay/settlement
NOTARY_WEBHOOK_SECRET=
```

Circle CLI must be installed and logged in on the executor host:

```sh
npm install -g @circle-fin/cli
circle terms accept
circle wallet login you@example.com --type agent
```

## Self-hosting on a VPS

Qevor can be self-hosted on a single Ubuntu VPS with a Namecheap domain. The `deploy/` directory contains everything needed: bootstrap script, systemd units, nginx config, env templates, and operational runbooks. See [deploy/README.md](deploy/README.md) for full instructions.
