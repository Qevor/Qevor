import { Router } from 'express';
import { supabase } from '../../../lib/supabase.js';

const router = Router();

router.post('/cosign/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { approved_by } = req.body;

  if (!approved_by) {
    res.status(400).json({ error: 'approved_by (profile_id) is required' });
    return;
  }

  const { data, error } = await supabase
    .from('agent_cosign_queue')
    .update({
      status: 'approved',
      approved_by,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Entry not found or already processed' });
    return;
  }

  res.json(data);
});

router.post('/cosign/:id/reject', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('agent_cosign_queue')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Entry not found or already processed' });
    return;
  }

  // Write audit log for rejection
  await supabase.from('agent_audit_log').insert({
    agent_wallet_id: data.agent_wallet_id,
    batch_payment_id: data.batch_payment_id,
    action: 'cosign_reject',
    recipient_address: data.recipient_address,
    amount_usdc: data.amount_usdc,
    outcome: 'blocked',
    reason: 'cosign_rejected_by_user',
  });

  res.json(data);
});

export default router;
