import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getQevorChainById } from '@/lib/chains';

export interface BatchRecipient {
    wallet: string;
    amount: number;
    label?: string;
}

export interface Batch {
    id: string;
    creator_wallet: string;
    title?: string;
    description?: string;
    recipients: BatchRecipient[];
    total_amount: number;
    chain_id?: number;
    token_symbol?: string;
    status: 'pending' | 'partial' | 'complete';
    expires_at?: string | null;
    created_at: string;
    executor_agent_wallet_id?: string | null;
    executor_state?: 'manual' | 'pending_evaluation' | 'in_progress' | 'complete' | 'cosign_required' | 'failed' | null;
}

export interface BatchPayment {
    id: string;
    batch_request_id: string;
    payer_wallet: string;
    recipient_wallet: string;
    amount: number;
    tx_hash: string;
    chain_id?: number;
    token_symbol?: string;
    status: string;
    created_at: string;
}

export function useBatchPayments() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createBatch = async (
        data: Omit<Batch, 'id' | 'created_at' | 'status'>
    ): Promise<Batch | null> => {
        setLoading(true);
        setError(null);
        try {
            const row: Record<string, unknown> = { ...data, status: 'pending' };
            if (data.executor_agent_wallet_id) {
                row.executor_state = data.executor_state ?? 'pending_evaluation';
            }
            const { data: result, error: sbError } = await supabase
                .from('batch_requests')
                .insert([row])
                .select()
                .single();

            if (sbError) throw sbError;
            const batch = result as Batch;
            const network = getQevorChainById(batch.chain_id);
            if (data.executor_agent_wallet_id) {
                const payments = data.recipients.map((recipient) => ({
                    batch_request_id: batch.id,
                    payer_wallet: data.creator_wallet,
                    recipient_wallet: recipient.wallet,
                    amount: recipient.amount,
                    tx_hash: '',
                    chain_id: batch.chain_id ?? network.chain.id,
                    token_symbol: batch.token_symbol ?? network.paymentAsset,
                    status: 'pending',
                }));

                const { error: paymentError } = await supabase.from('batch_payments').insert(payments);
                if (paymentError) throw paymentError;
            }
            return {
                ...batch,
                chain_id: batch.chain_id ?? network.chain.id,
                token_symbol: batch.token_symbol ?? network.paymentAsset,
            };
        } catch (err: any) {
            console.error('Error creating batch payment:', err);
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const getBatch = async (id: string): Promise<Batch | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('batch_requests')
                .select('*')
                .eq('id', id)
                .single();

            if (sbError) throw sbError;
            const batch = data as Batch;
            const network = getQevorChainById(batch.chain_id);
            return {
                ...batch,
                chain_id: batch.chain_id ?? network.chain.id,
                token_symbol: batch.token_symbol ?? network.paymentAsset,
            };
        } catch (err: any) {
            console.error('Error fetching batch payment:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getBatchesByWallet = async (wallet: string): Promise<Batch[]> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('batch_requests')
                .select('*')
                .eq('creator_wallet', wallet)
                .order('created_at', { ascending: false });

            if (sbError) throw sbError;
            return ((data || []) as Batch[]).map(batch => {
                const network = getQevorChainById(batch.chain_id);
                return {
                    ...batch,
                    chain_id: batch.chain_id ?? network.chain.id,
                    token_symbol: batch.token_symbol ?? network.paymentAsset,
                };
            });
        } catch (err: any) {
            console.error('Error fetching batch payments:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const recordBatchPayment = async (
        batchId: string,
        payerWallet: string,
        recipientWallet: string,
        amount: number,
        txHash: string,
        chainId?: number,
        tokenSymbol?: string
    ): Promise<void> => {
        try {
            const { error: insertError } = await supabase.from('batch_payments').insert([{
                batch_request_id: batchId,
                payer_wallet: payerWallet,
                recipient_wallet: recipientWallet,
                amount,
                tx_hash: txHash,
                chain_id: chainId,
                token_symbol: tokenSymbol,
                status: 'paid'
            }]);

            if (insertError) throw insertError;
        } catch (err: any) {
            console.error('Error recording batch payment:', err);
            throw err;
        }
    };

    const updateBatchStatus = async (batchId: string, status: 'pending' | 'partial' | 'complete') => {
        try {
            await supabase.from('batch_requests').update({ status }).eq('id', batchId);
        } catch (err) {
            console.error('Error updating batch status:', err);
        }
    };

    const getBatchPayments = async (batchId: string): Promise<BatchPayment[]> => {
        try {
            const { data, error } = await supabase
                .from('batch_payments')
                .select('*')
                .eq('batch_request_id', batchId);

            if (error) throw error;
            return ((data || []) as BatchPayment[]).map(payment => {
                const network = getQevorChainById(payment.chain_id);
                return {
                    ...payment,
                    chain_id: payment.chain_id ?? network.chain.id,
                    token_symbol: payment.token_symbol ?? network.paymentAsset,
                };
            });
        } catch (err) {
            console.error('Error fetching batch payments:', err);
            return [];
        }
    };

    const getBatchPaymentsByWallet = async (wallet: string): Promise<BatchPayment[]> => {
        try {
            const { data, error } = await supabase
                .from('batch_payments')
                .select('*')
                .eq('payer_wallet', wallet)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return ((data || []) as BatchPayment[]).map(payment => {
                const network = getQevorChainById(payment.chain_id);
                return {
                    ...payment,
                    chain_id: payment.chain_id ?? network.chain.id,
                    token_symbol: payment.token_symbol ?? network.paymentAsset,
                };
            });
        } catch (err) {
            console.error('Error fetching batch payments by wallet:', err);
            return [];
        }
    };

    return {
        createBatch,
        getBatch,
        getBatchesByWallet,
        recordBatchPayment,
        getBatchPayments,
        getBatchPaymentsByWallet,
        updateBatchStatus,
        loading,
        error
    };
}
