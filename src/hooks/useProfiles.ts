import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Profile {
    wallet: string;
    username?: string | null;
    created_at: string;
}

export function useProfiles() {
    const [loading, setLoading] = useState(false);

    const cleanWallet = (wallet: string) => wallet.trim().toLowerCase();
    const cleanUsername = (username: string) => username.replace(/^@+/, '').trim().toLowerCase();

    const getProfileByWallet = useCallback(async (wallet: string): Promise<Profile | null> => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .ilike('wallet', cleanWallet(wallet))
                .maybeSingle();

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
            const usernameKey = cleanUsername(username);
            const { data, error } = await supabase
                .from('profiles')
                .select('wallet')
                .ilike('username', usernameKey)
                .maybeSingle();

            if (error || !data) return null;
            return data.wallet;
        } catch (e) {
            return null;
        }
    }, []);

    const registerUsername = useCallback(async (wallet: string, username: string) => {
        setLoading(true);
        try {
            const walletKey = cleanWallet(wallet);
            const usernameKey = cleanUsername(username);

            if (!/^[a-z0-9_]{3,24}$/.test(usernameKey)) {
                toast.error('Use 3-24 lowercase letters, numbers, or underscores.');
                return null;
            }

            const { data: walletProfile, error: walletError } = await supabase
                .from('profiles')
                .select('*')
                .ilike('wallet', walletKey)
                .maybeSingle();

            if (walletError) throw walletError;

            if (walletProfile?.username) {
                toast.error(`This wallet already owns @${walletProfile.username}.`);
                return walletProfile;
            }

            const { data: usernameProfile, error: usernameError } = await supabase
                .from('profiles')
                .select('*')
                .ilike('username', usernameKey)
                .maybeSingle();

            if (usernameError) throw usernameError;

            if (usernameProfile && usernameProfile.wallet?.toLowerCase() !== walletKey) {
                toast.error(`@${usernameKey} is already taken.`);
                return null;
            }

            const query = walletProfile
                ? supabase
                    .from('profiles')
                    .update({ username: usernameKey, updated_at: new Date().toISOString() })
                    .ilike('wallet', walletKey)
                : supabase
                    .from('profiles')
                    .insert([{ wallet: walletKey, username: usernameKey }]);

            const { data, error } = await query.select().single();

            if (error) throw error;

            toast.success(`Successfully claimed @${usernameKey}!`);
            return data;
        } catch (error: any) {
            const message = String(error?.message || '');
            if (/duplicate key|unique/i.test(message)) {
                toast.error('That username or wallet is already registered.');
            } else if (/failed to fetch/i.test(message)) {
                toast.error('Could not reach Qevor profiles. Check the Supabase deployment config.');
            } else {
                toast.error(message || 'Unexpected error during registration.');
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const ensureProfile = useCallback(async (wallet: string): Promise<Profile | null> => {
        const walletKey = cleanWallet(wallet);
        if (!walletKey) return null;

        const existing = await getProfileByWallet(walletKey);
        if (existing) return existing;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .insert([{ wallet: walletKey }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch {
            return null;
        }
    }, [getProfileByWallet]);

    return {
        ensureProfile,
        getProfileByWallet,
        resolveUsernameToWallet,
        registerUsername,
        loading
    };
}
