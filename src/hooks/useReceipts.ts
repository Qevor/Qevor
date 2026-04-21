import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Receipt {
    id: string;
    sender: string;
    receiver: string;
    amount: number;
    tx_hash: string;
    status: string;
    memo?: string;
    created_at: string;
}

export function useReceipts() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getReceipt = async (id: string): Promise<Receipt | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('receipts')
                .select('*')
                .eq('id', id)
                .single();

            if (sbError) throw sbError;
            return data as Receipt;
        } catch (err: any) {
            console.error('Error fetching receipt:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const createReceipt = async (receiptData: Omit<Receipt, 'id' | 'created_at'>) => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('receipts')
                .insert([receiptData])
                .select()
                .single();

            if (sbError) throw sbError;
            return data as Receipt;
        } catch (err: any) {
            console.error('Error creating receipt:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { getReceipt, createReceipt, loading, error };
}
