# Agent Stack Architecture

## Overview

The Agent Stack adds two capabilities to Qevor:

1. **AI Treasurer** — Circle Agent Wallets with policy-based spending controls
2. **Autonomous Batch Execution** — policy-gated payroll engine with human escalation

## Batch Executor Flow

```mermaid
sequenceDiagram
    participant User
    participant SPA
    participant Supabase
    participant Executor
    participant CircleCLI

    User->>SPA: Create batch with "Execute via agent"
    SPA->>Supabase: INSERT batch_request (executor_state='pending_evaluation')
    loop Every 15s
        Executor->>Supabase: Poll for pending batches
    end
    Executor->>Supabase: Load policy for agent wallet
    Executor->>Supabase: Compute spend windows from audit log
    loop For each batch_payment
        Executor->>Executor: evaluate(policy, payment, ctx)
        alt execute
            Executor->>CircleCLI: circle wallet transfer
            CircleCLI-->>Executor: tx_hash
            Executor->>Supabase: Write audit_log (executed), receipt, mark paid
        else cosign_required
            Executor->>Supabase: Insert cosign_queue entry
            Executor->>Supabase: Write audit_log (cosign_required)
        else blocked
            Executor->>Supabase: Write audit_log (blocked)
        end
    end
    Executor->>Supabase: Set executor_state='completed'
```

## Policy Evaluation Order

```mermaid
flowchart TD
    A[Start] --> B{Address blocklisted?}
    B -->|Yes| BLOCK[Blocked]
    B -->|No| C{Username blocklisted?}
    C -->|Yes| BLOCK
    C -->|No| D{Outside allowed hours?}
    D -->|Yes| BLOCK
    D -->|No| E{Address not in allowlist?}
    E -->|Yes| BLOCK
    E -->|No| F{Username not in allowlist?}
    F -->|Yes| BLOCK
    F -->|No| G{Per-tx cap exceeded?}
    G -->|Yes| BLOCK
    G -->|No| H{Daily/weekly/monthly cap exceeded?}
    H -->|Yes| BLOCK
    H -->|No| I{Above cosign threshold?}
    I -->|Yes| COSIGN[Cosign Required]
    I -->|No| EXEC[Execute]
```

## Cosign Approval Flow

```mermaid
sequenceDiagram
    participant User
    participant SPA
    participant Supabase
    participant Executor
    participant CircleCLI

    User->>SPA: View cosign queue
    SPA->>Supabase: Fetch pending entries
    User->>SPA: Click Approve
    SPA->>Supabase: Update status='approved'
    loop Every 15s
        Executor->>Supabase: Poll approved cosign entries
    end
    Executor->>CircleCLI: circle wallet transfer
    CircleCLI-->>Executor: tx_hash
    Executor->>Supabase: Write audit_log (executed, cosigned_by)
    Executor->>Supabase: Write receipt
```

## VPS Topology

```
Internet -> Nginx (TLS :443) -> /        -> Static SPA (dist/)
                              -> /api/*   -> qevor-api (Express, :3000)

qevor-executor (systemd, no public port)
  -> polls Supabase
  -> shells out to `circle wallet transfer`
  -> Circle CLI session in /var/lib/qevor-executor/.circle
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `agent_wallets` | User's registered agent wallets |
| `agent_policies` | Spending policies per wallet |
| `agent_audit_log` | Immutable log of every executor decision |
| `agent_cosign_queue` | Human approval queue for escalated transfers |
| `executor_health` | Executor heartbeat and session state |
