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
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { profile_wallet, wallet_address, chain, label } = parsed.data;

  const { data, error } = await supabase
    .from('agent_wallets')
    .insert({
      profile_wallet,
      wallet_address,
      chain,
      label: label ?? null,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    res.status(status).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

export default router;
