export interface AgentWallet {
  id: string;
  profile_wallet: string;
  wallet_address: string;
  chain: string;
  label: string | null;
  status: 'active' | 'paused' | 'revoked';
  executor_mode: 'escrow' | 'delegate' | null;
  escrow_address: string | null;
  created_at: string;
}

export interface AgentPolicy {
  id: string;
  agent_wallet_id: string;
  max_per_tx_usdc: number | null;
  daily_cap_usdc: number | null;
  weekly_cap_usdc: number | null;
  monthly_cap_usdc: number | null;
  allowlist_addresses: string[];
  blocklist_addresses: string[];
  allowlist_usernames: string[];
  blocklist_usernames: string[];
  allowed_hours_utc: string | null; // int4range as string e.g. "[9,18)"
  cosign_threshold_usdc: number | null;
  mirrored_to_circle_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentAuditEntry {
  id: string;
  agent_wallet_id: string;
  policy_id: string | null;
  batch_request_id: string | null;
  batch_payment_id: string | null;
  action: string;
  recipient_username: string | null;
  recipient_address: string | null;
  amount_usdc: number | null;
  outcome: 'executed' | 'blocked' | 'cosign_required' | 'failed';
  reason: string | null;
  tx_hash: string | null;
  circle_tx_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CosignQueueEntry {
  id: string;
  agent_wallet_id: string;
  batch_payment_id: string;
  recipient_username: string | null;
  recipient_address: string;
  amount_usdc: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approved_by: string | null;
  approved_at: string | null;
  expires_at: string;
  created_at: string;
}
