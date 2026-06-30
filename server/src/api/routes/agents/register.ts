import { Router } from 'express';
import { z } from 'zod';
import { isAddress } from 'viem';
import { supabase } from '../../../lib/supabase.js';

const router = Router();

const registerSchema = z.object({
  profile_wallet: z.string().refine((v) => isAddress(v), 'Invalid EVM address'),
  wallet_address: z.string().refine((v) => isAddress(v), 'Invalid EVM address'),
  chain: z.string().min(1),
  label: z.string().optional(),
  executor_mode: z.enum(['escrow']).nullable().optional(),
  escrow_address: z.string().refine((v) => isAddress(v), 'Invalid escrow address').nullable().optional(),
});

function fallbackUsernameForWallet(wallet: string) {
  const normalized = wallet.trim().toLowerCase().replace(/^0x/, '');
  return `qevor_${normalized.slice(0, 8)}_${normalized.slice(-6)}`;
}

async function ensureProfile(wallet: string) {
  const { data: existingProfile, error: selectError } = await supabase
    .from('profiles')
    .select('wallet')
    .ilike('wallet', wallet)
    .maybeSingle();

  if (selectError) return { error: selectError, wallet: null };
  if (existingProfile?.wallet) return { error: null, wallet: existingProfile.wallet };

  const { data: insertedProfile, error: insertError } = await supabase
    .from('profiles')
    .insert({
      wallet,
      username: fallbackUsernameForWallet(wallet),
    })
    .select('wallet')
    .single();

  return { error: insertError, wallet: insertedProfile?.wallet ?? wallet };
}

async function fetchExistingAgentWallet(profileWallet: string, walletAddress: string, chain: string) {
  return supabase
    .from('agent_wallets')
    .select()
    .eq('profile_wallet', profileWallet)
    .eq('wallet_address', walletAddress)
    .eq('chain', chain)
    .maybeSingle();
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { profile_wallet, wallet_address, chain, label, executor_mode, escrow_address } = parsed.data;
  const normalizedProfileWallet = profile_wallet.trim().toLowerCase();
  const normalizedWalletAddress = wallet_address.trim().toLowerCase();

  const profileResult = await ensureProfile(normalizedProfileWallet);

  if (profileResult.error || !profileResult.wallet) {
    res.status(500).json({ error: profileResult.error?.message ?? 'Could not create profile' });
    return;
  }

  const { data, error } = await supabase
    .from('agent_wallets')
    .insert({
      profile_wallet: profileResult.wallet,
      wallet_address: normalizedWalletAddress,
      chain,
      label: label ?? null,
      executor_mode: executor_mode ?? null,
      escrow_address: escrow_address ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existingWallet, error: existingError } = await fetchExistingAgentWallet(
        profileResult.wallet,
        normalizedWalletAddress,
        chain,
      );

      if (!existingError && existingWallet) {
        res.status(200).json(existingWallet);
        return;
      }
    }

    const status = error.code === '23505' ? 409 : 500;
    res.status(status).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

export default router;
