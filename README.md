# Qevor

A production-ready decentralized payment application for creating, sharing, and managing crypto payment links, batch requests, and seamless wallet-to-wallet transfers. Qevor is designed for the Arc Testnet.

## ✨ Features

- **Global Username System:** Maps unique usernames to wallet addresses for easier and safer payments.
- **Payment Links:** Generates shareable payment links that specify amount and receiver or group criteria.
- **Batch Requests:** Built-in dashboard for requesting and distributing batch payments to multiple recipients at once.
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

## Self-hosting on a VPS

Qevor can be self-hosted on a single Ubuntu VPS with a Namecheap domain. The `deploy/` directory contains everything needed: bootstrap script, systemd units, nginx config, env templates, and operational runbooks. See [deploy/README.md](deploy/README.md) for full instructions.
