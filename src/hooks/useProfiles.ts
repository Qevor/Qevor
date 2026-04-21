import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Profile {
    wallet: string;
    username: string;
    created_at: string;
}

export function useProfiles() {
    const [loading, setLoading] = useState(false);

    const getProfileByWallet = useCallback(async (wallet: string): Promise<Profile | null> => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .ilike('wallet', wallet)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    console.error('getProfileByWallet error:', error);
                }
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }, []);

    const resolveUsernameToWallet = useCallback(async (username: string): Promise<string | null> => {
        try {
            // Strip @ if the user typed it
            const cleanUsername = username.replace('@', '');
            const { data, error } = await supabase
                .from('profiles')
                .select('wallet')
                .ilike('username', cleanUsername)
                .single();

            if (error || !data) return null;
            return data.wallet;
        } catch (e) {
            return null;
        }
    }, []);

    const registerUsername = useCallback(async (wallet: string, username: string) => {
        setLoading(true);
        try {
            const cleanUsername = username.replace('@', '').toLowerCase();
            const { data, error } = await supabase
                .from('profiles')
                .insert([{ wallet, username: cleanUsername }])
                .select()
                .single();

            if (error) {
                toast.error(error.message || 'Failed to register username. It might already be taken.');
                return null;
            }
            toast.success(`Successfully claimed @${cleanUsername}!`);
            return data;
        } catch (error: any) {
            toast.error('Unexpected error during registration.');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        getProfileByWallet,
        resolveUsernameToWallet,
        registerUsername,
        loading
    };
}
