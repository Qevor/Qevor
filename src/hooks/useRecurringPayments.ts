import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getQevorChainById } from '@/lib/chains';

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';
export type RecurringStatus = 'active' | 'paused' | 'cancelled' | 'complete';
export type RecurringExecutionMode = 'human' | 'agent';

export interface RecurringPayment {
  id: string;
  creator_wallet: string;
  receiver_wallet: string;
  amount: number;
  chain_id: number;
  token_symbol: string;
  frequency: RecurringFrequency;
  interval_count: number;
  start_at: string;
  next_run_at: string;
  end_at?: string | null;
  max_runs?: number | null;
  run_count: number;
  status: RecurringStatus;
  title?: string | null;
  memo?: string | null;
  execution_mode: RecurringExecutionMode;
  executor_agent_wallet_id?: string | null;
  last_tx_hash?: string | null;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringPaymentInput {
  creator_wallet: string;
  receiver_wallet: string;
  amount: number;
  chain_id: number;
  token_symbol: string;
  frequency: RecurringFrequency;
  interval_count: number;
  start_at: string;
  next_run_at: string;
  end_at?: string | null;
  max_runs?: number | null;
  title?: string | null;
  memo?: string | null;
  execution_mode?: RecurringExecutionMode;
  executor_agent_wallet_id?: string | null;
}

function normalizeRecurring(row: any): RecurringPayment {
  const network = getQevorChainById(row.chain_id);
  return {
    ...row,
    amount: Number(row.amount),
    chain_id: row.chain_id ?? network.chain.id,
    token_symbol: row.token_symbol ?? network.paymentAsset,
    interval_count: Number(row.interval_count ?? 1),
    run_count: Number(row.run_count ?? 0),
  };
}

export function useRecurringPayments() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecurringPaymentsByWallet = async (wallet: string): Promise<RecurringPayment[]> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase
        .from('recurring_payments')
        .select('*')
        .or(`creator_wallet.ilike.${wallet},receiver_wallet.ilike.${wallet}`)
        .order('created_at', { ascending: false });

      if (sbError) throw sbError;
      return (data || []).map(normalizeRecurring);
    } catch (err: any) {
      console.error('Error loading recurring payments:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createRecurringPayment = async (input: CreateRecurringPaymentInput): Promise<RecurringPayment | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase
        .from('recurring_payments')
        .insert([input])
        .select()
        .single();

      if (sbError) throw sbError;
      return normalizeRecurring(data);
    } catch (err: any) {
      console.error('Error creating recurring payment:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateRecurringStatus = async (id: string, status: RecurringStatus): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { error: sbError } = await supabase
        .from('recurring_payments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (sbError) throw sbError;
      return true;
    } catch (err: any) {
      console.error('Error updating recurring payment:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    getRecurringPaymentsByWallet,
    createRecurringPayment,
    updateRecurringStatus,
    loading,
    error,
  };
}
