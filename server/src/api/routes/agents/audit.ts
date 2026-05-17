import { Router } from 'express';
import { supabase } from '../../../lib/supabase.js';

const router = Router();

router.get('/audit', async (req, res) => {
  const { wallet_id, from, to, outcome, limit, offset } = req.query;

  if (!wallet_id || typeof wallet_id !== 'string') {
    res.status(400).json({ error: 'wallet_id is required' });
    return;
  }

  let query = supabase
    .from('agent_audit_log')
    .select('*', { count: 'exact' })
    .eq('agent_wallet_id', wallet_id)
    .order('created_at', { ascending: false });

  if (from && typeof from === 'string') query = query.gte('created_at', from);
  if (to && typeof to === 'string') query = query.lte('created_at', to);
  if (outcome && typeof outcome === 'string') query = query.eq('outcome', outcome);

  const lim = Math.min(parseInt(String(limit ?? '50'), 10) || 50, 100);
  const off = parseInt(String(offset ?? '0'), 10) || 0;
  query = query.range(off, off + lim - 1);

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ entries: data ?? [], count: count ?? 0 });
});

export default router;
