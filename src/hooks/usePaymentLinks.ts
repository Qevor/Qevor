import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getQevorChainById } from '@/lib/chains';

export interface PaymentLinkData {
    id?: string;
    receiver_wallet: string;
    amount: number;
    chain_id?: number;
    token_symbol?: string;
    expires_at?: string | null;
    max_uses?: number | null;
    current_uses?: number;
    group_id?: string | null;
    created_at?: string;
}

export function usePaymentLinks() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createLinks = async (links: PaymentLinkData[]) => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('payment_links')
                .insert(links)
                .select();

            if (sbError) throw sbError;
            return data;
        } catch (err: any) {
            console.error('Error creating links:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getLink = async (id: string): Promise<PaymentLinkData | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('payment_links')
                .select('*')
                .eq('id', id)
                .single();

            if (sbError) throw sbError;
            const link = data as PaymentLinkData;
            const network = getQevorChainById(link.chain_id);
            return {
                ...link,
                chain_id: link.chain_id ?? network.chain.id,
                token_symbol: link.token_symbol ?? network.paymentAsset,
            };
        } catch (err: any) {
            console.error('Error fetching link:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getLinksByGroup = async (groupId: string): Promise<PaymentLinkData[]> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase
                .from('payment_links')
                .select('*')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false });

            if (sbError) throw sbError;
            return data || [];
        } catch (err: any) {
            console.error('Error fetching links by group:', err);
            setError(err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const incrementUsage = async (id: string, currentUses: number) => {
        try {
            const { data, error: sbError } = await supabase
                .from('payment_links')
                .update({ current_uses: currentUses + 1 })
                .eq('id', id)
                .select()
                .single();

            if (sbError) throw sbError;
            return data;
        } catch (err: any) {
            console.error('Error incrementing usage:', err);
            return null;
        }
    };

    return { createLinks, getLink, getLinksByGroup, incrementUsage, loading, error };
}
