import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BatchRecipient {
    wallet: string;
    amount: number;
    label?: string;
}

export interface BatchRequest {
    id: string;
    creator_wallet: string;
    title?: string;
    description?: string;
    recipients: BatchRecipient[];
    total_amount: number;
    status: 'pending' | 'partial' | 'complete';
    expires_at?: string | null;
    created_at: string;
}

export interface BatchPayment {
    id: string;
    batch_request_id: string;
    payer_wallet: string;
    recipient_wallet: string;
    amount: number;
    tx_hash: string;
    status: string;
    created_at: string;
}

export function useBatchRequests() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createBatchRequest = async (
        data: Omit<BatchRequest, 'id' | 'created_at' | 'status'>
    ): Promise<BatchRequest | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data: result, error: sbError } = await supabase
                .from('batch_requests')
                .insert([{ ...data, status: 'pending' }])
                .select()
                .single();

            if (sbError) throw sbError;
            return result as BatchRequest;
        } catch (err: any) {
            console.error('Error creating batch request:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getBatchRequest = async (id: string): Promise<BatchRequest | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('batch_requests')
                .select('*')
                .eq('id', id)
                .single();

            if (sbError) throw sbError;
            return data as BatchRequest;
        } catch (err: any) {
            console.error('Error fetching batch request:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getBatchRequestsByWallet = async (wallet: string): Promise<BatchRequest[]> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('batch_requests')
                .select('*')
                .eq('creator_wallet', wallet)
                .order('created_at', { ascending: false });

            if (sbError) throw sbError;
            return (data || []) as BatchRequest[];
        } catch (err: any) {
            console.error('Error fetching batch requests:', err);
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
        txHash: string
    ): Promise<void> => {
        try {
            const { error: insertError } = await supabase.from('batch_payments').insert([{
                batch_request_id: batchId,
                payer_wallet: payerWallet,
                recipient_wallet: recipientWallet,
                amount,
                tx_hash: txHash,
                status: 'paid'
            }]);

            if (insertError) throw insertError;

            // Automatically evaluate status update for the batch!
            // Here we just let RequestPage handle status if we want, or do a quick re-check
        } catch (err: any) {
            console.error('Error recording batch payment:', err);
            throw err;
        }
    };

    const updateBatchStatus = async (batchId: string, status: 'pending' | 'partial' | 'complete') => {
        try {
            await supabase.from('batch_requests').update({ status }).eq('id', batchId);
        } catch (error) {
            console.error("error updating batch status", error)
        }
    }

    const getBatchPayments = async (batchId: string): Promise<BatchPayment[]> => {
        try {
            const { data, error } = await supabase
                .from('batch_payments')
                .select('*')
                .eq('batch_request_id', batchId);

            if (error) throw error;
            return (data || []) as BatchPayment[];
        } catch (err) {
            console.error('Error fetching batch payments:', err);
            return [];
        }
    };

    return {
        createBatchRequest,
        getBatchRequest,
        getBatchRequestsByWallet,
        recordBatchPayment,
        getBatchPayments,
        updateBatchStatus,
        loading,
        error
    };
}
