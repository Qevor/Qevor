import { supabase } from '@/integrations/supabase/client';
import type { AgentWallet, AgentPolicy, AgentAuditEntry, CosignQueueEntry } from './types';

async function ensureAgentProfile(profileWallet: string): Promise<string> {
  const wallet = profileWallet.trim().toLowerCase();
  if (!wallet) throw new Error('Connect your wallet before registering an agent wallet.');

  const { error } = await supabase
    .from('profiles')
    .upsert({ wallet }, { onConflict: 'wallet' });

  if (error) throw error;
  return wallet;
}

export async function fetchAgentWallets(profileWallet: string): Promise<AgentWallet[]> {
  const { data, error } = await supabase
    .from('agent_wallets')
    .select('*')
    .ilike('profile_wallet', profileWallet.trim().toLowerCase())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AgentWallet[];
}

export async function registerAgentWallet(
  profileWallet: string,
  walletAddress: string,
  chain: string,
  label?: string,
  opts?: {
    executorMode?: AgentWallet['executor_mode'];
    escrowAddress?: string | null;
  },
): Promise<AgentWallet> {
  const normalizedProfileWallet = await ensureAgentProfile(profileWallet);

  const { data, error } = await supabase
    .from('agent_wallets')
    .insert({
      profile_wallet: normalizedProfileWallet,
      wallet_address: walletAddress.trim().toLowerCase(),
      chain,
      label: label ?? null,
      executor_mode: opts?.executorMode ?? null,
      escrow_address: opts?.escrowAddress ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AgentWallet;
}

export async function fetchPolicy(agentWalletId: string): Promise<AgentPolicy | null> {
  const { data, error } = await supabase
    .from('agent_policies')
    .select('*')
    .eq('agent_wallet_id', agentWalletId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return (data as AgentPolicy) ?? null;
}

export async function upsertPolicy(
  agentWalletId: string,
  policy: Partial<AgentPolicy>,
): Promise<AgentPolicy> {
  // Deactivate existing policies
  await supabase
    .from('agent_policies')
    .update({ active: false })
    .eq('agent_wallet_id', agentWalletId)
    .eq('active', true);

  const { data, error } = await supabase
    .from('agent_policies')
    .insert({
      agent_wallet_id: agentWalletId,
      ...policy,
      active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AgentPolicy;
}

export async function fetchAuditLog(
  agentWalletId: string,
  opts?: { from?: string; to?: string; outcome?: string; limit?: number; offset?: number },
): Promise<{ entries: AgentAuditEntry[]; count: number }> {
  let query = supabase
    .from('agent_audit_log')
    .select('*', { count: 'exact' })
    .eq('agent_wallet_id', agentWalletId)
    .order('created_at', { ascending: false });

  if (opts?.from) query = query.gte('created_at', opts.from);
  if (opts?.to) query = query.lte('created_at', opts.to);
  if (opts?.outcome) query = query.eq('outcome', opts.outcome);
  if (opts?.limit) query = query.limit(opts.limit);
  if (opts?.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { entries: (data ?? []) as AgentAuditEntry[], count: count ?? 0 };
}

export async function fetchCosignQueue(
  agentWalletId: string,
  status?: string,
): Promise<CosignQueueEntry[]> {
  let query = supabase
    .from('agent_cosign_queue')
    .select('*')
    .eq('agent_wallet_id', agentWalletId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CosignQueueEntry[];
}

export async function approveCosignEntry(entryId: string, approvedBy: string): Promise<void> {
  const { error } = await supabase
    .from('agent_cosign_queue')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', entryId);

  if (error) throw error;
}

export async function rejectCosignEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_cosign_queue')
    .update({ status: 'rejected' })
    .eq('id', entryId);

  if (error) throw error;
}
