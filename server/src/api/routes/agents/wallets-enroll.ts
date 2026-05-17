import { Router } from 'express';
import { supabase } from '../../../lib/supabase.js';

const router = Router();

// Enroll a wallet for autonomous execution (marks it for executor pickup)
router.post('/wallets/:id/enroll-executor', async (req, res) => {
  const { id } = req.params;

  // Verify wallet exists
  const { data: wallet, error: fetchErr } = await supabase
    .from('agent_wallets')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !wallet) {
    res.status(404).json({ error: 'Agent wallet not found' });
    return;
  }

  if (wallet.executor_mode) {
    res.status(409).json({ error: 'Already enrolled', escrow_address: wallet.escrow_address });
    return;
  }

  // Mark as pending enrollment — the executor will pick this up,
  // create the escrow wallet, and update the row.
  const { data, error } = await supabase
    .from('agent_wallets')
    .update({ executor_mode: 'escrow' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

export default router;
