import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../../lib/supabase.js';

const router = Router();

const policySchema = z.object({
  agent_wallet_id: z.string().uuid(),
  max_per_tx_usdc: z.number().nonnegative().nullable().optional(),
  daily_cap_usdc: z.number().nonnegative().nullable().optional(),
  weekly_cap_usdc: z.number().nonnegative().nullable().optional(),
  monthly_cap_usdc: z.number().nonnegative().nullable().optional(),
  allowlist_addresses: z.array(z.string()).optional().default([]),
  blocklist_addresses: z.array(z.string()).optional().default([]),
  allowlist_usernames: z.array(z.string()).optional().default([]),
  blocklist_usernames: z.array(z.string()).optional().default([]),
  allowed_hours_utc: z.string().nullable().optional(),
  cosign_threshold_usdc: z.number().nonnegative().nullable().optional(),
}).refine((data) => {
  const perTx = data.max_per_tx_usdc ?? Infinity;
  const daily = data.daily_cap_usdc ?? Infinity;
  const weekly = data.weekly_cap_usdc ?? Infinity;
  const monthly = data.monthly_cap_usdc ?? Infinity;
  return perTx <= daily && daily <= weekly && weekly <= monthly;
}, { message: 'Caps must satisfy: per_tx <= daily <= weekly <= monthly' });

router.post('/policies', async (req, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { agent_wallet_id, ...fields } = parsed.data;

  // Deactivate existing active policies
  await supabase
    .from('agent_policies')
    .update({ active: false })
    .eq('agent_wallet_id', agent_wallet_id)
    .eq('active', true);

  const { data, error } = await supabase
    .from('agent_policies')
    .insert({ agent_wallet_id, ...fields, active: true })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

export default router;
