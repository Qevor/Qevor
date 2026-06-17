import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { isAddress } from 'viem';
import { supabase } from '../../lib/supabase.js';
import {
  chainIdForAgentChain,
  escrowContractAddressForAgentChain,
  isMantleAgentChain,
  normalizeAgentChain,
  tokenSymbolForAgentChain,
} from '../../executor/chain-support.js';

const router = Router();

const recipientSchema = z.object({
  wallet: z.string(),
  amount: z.number().positive().finite(),
  label: z.string().max(120).optional(),
});

const safetyReviewSchema = z.object({
  recipients: z.array(recipientSchema).min(1).max(500),
});

const batchSkillSchema = z.object({
  request_id: z.string().min(1).max(200),
  agent_wallet_id: z.string().uuid(),
  title: z.string().max(160).optional(),
  description: z.string().max(1000).optional(),
  recipients: z.array(recipientSchema).min(1).max(100),
});

export const qevorSkillManifest = {
  name: 'qevor-mantle-payments',
  version: '0.1.0',
  description: 'Policy-gated agent payment safety review and batch execution on Mantle Sepolia and Mantle Mainnet.',
  chains: ['eip155:5003', 'eip155:5000'],
  skills: [
    {
      id: 'payment-safety-review',
      method: 'POST',
      path: '/api/skills/payment-safety-review',
      description: 'Checks recipient validity, duplicates, totals, and unusually large payment lines.',
    },
    {
      id: 'batch-payment',
      method: 'POST',
      path: '/api/skills/batch-payment',
      description: 'Queues an idempotent policy-gated batch for the Qevor agent executor.',
    },
  ],
};

router.get('/', (_req, res) => {
  res.json(qevorSkillManifest);
});

router.post('/payment-safety-review', requireAgentApiKey, (req, res) => {
  const parsed = safetyReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  res.json(reviewRecipients(parsed.data.recipients));
});

router.post('/batch-payment', requireAgentApiKey, async (req, res) => {
  const parsed = batchSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const input = parsed.data;
  const review = reviewRecipients(input.recipients);
  if (!review.allowed) {
    res.status(422).json({ error: 'Payment safety review blocked this batch', review });
    return;
  }

  const { data: existing } = await supabase
    .from('batch_requests')
    .select('*')
    .eq('agent_request_id', input.request_id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    res.status(200).json({ batch: existing, idempotent_replay: true, review });
    return;
  }

  const { data: wallet, error: walletError } = await supabase
    .from('agent_wallets')
    .select('*')
    .eq('id', input.agent_wallet_id)
    .eq('status', 'active')
    .single();

  if (walletError || !wallet) {
    res.status(404).json({ error: 'Active agent wallet not found' });
    return;
  }
  const chain = normalizeAgentChain(wallet.chain);
  const configuredMantleEscrow = isMantleAgentChain(chain) ? escrowContractAddressForAgentChain(chain) : undefined;
  const executionEscrow = configuredMantleEscrow || wallet.escrow_address;
  if (wallet.executor_mode !== 'escrow' || !executionEscrow) {
    res.status(409).json({ error: 'Agent wallet is not enrolled with an escrow executor' });
    return;
  }

  const chainId = chainIdForAgentChain(chain);
  const tokenSymbol = tokenSymbolForAgentChain(chain);
  const totalAmount = input.recipients.reduce((sum, recipient) => sum + recipient.amount, 0);

  const { data: batch, error: batchError } = await supabase
    .from('batch_requests')
    .insert({
      creator_wallet: wallet.profile_wallet,
      title: input.title ?? 'Agent-created batch',
      description: input.description ?? 'Created through the Qevor agent payment skill',
      recipients: input.recipients,
      total_amount: totalAmount,
      status: 'pending',
      chain_id: chainId,
      token_symbol: tokenSymbol,
      executor_agent_wallet_id: wallet.id,
      executor_state: 'pending_evaluation',
      agent_request_id: input.request_id,
    })
    .select()
    .single();

  if (batchError || !batch) {
    const status = batchError?.code === '23505' ? 409 : 500;
    res.status(status).json({ error: batchError?.message ?? 'Failed to create batch' });
    return;
  }

  const payments = input.recipients.map((recipient) => ({
    batch_request_id: batch.id,
    payer_wallet: wallet.profile_wallet,
    recipient_wallet: recipient.wallet,
    amount: recipient.amount,
    tx_hash: '',
    chain_id: chainId,
    token_symbol: tokenSymbol,
    status: 'pending',
  }));
  const { error: paymentsError } = await supabase.from('batch_payments').insert(payments);

  if (paymentsError) {
    await supabase.from('batch_requests').delete().eq('id', batch.id);
    res.status(500).json({ error: paymentsError.message });
    return;
  }

  res.status(202).json({ batch, review, idempotent_replay: false });
});

function requireAgentApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.QEVOR_AGENT_API_KEY;
  const supplied = req.get('x-qevor-agent-key');

  if (!expected) {
    res.status(503).json({ error: 'QEVOR_AGENT_API_KEY is not configured' });
    return;
  }
  if (!supplied || !secureEqual(supplied, expected)) {
    res.status(401).json({ error: 'Invalid agent API key' });
    return;
  }
  next();
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function reviewRecipients(recipients: Array<{ wallet: string; amount: number; label?: string }>) {
  const addressCounts = new Map<string, number>();
  const invalidAddresses: string[] = [];
  const unusuallyLargeLines: Array<{ wallet: string; amount: number }> = [];
  const largeLineThreshold = Number(process.env.QEVOR_SKILL_LARGE_PAYMENT_THRESHOLD ?? '100');

  for (const recipient of recipients) {
    if (!isAddress(recipient.wallet)) invalidAddresses.push(recipient.wallet);
    const normalized = recipient.wallet.toLowerCase();
    addressCounts.set(normalized, (addressCounts.get(normalized) ?? 0) + 1);
    if (recipient.amount > largeLineThreshold) {
      unusuallyLargeLines.push({ wallet: recipient.wallet, amount: recipient.amount });
    }
  }

  const duplicateAddresses = [...addressCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([address, count]) => ({ address, count }));
  const totalAmount = recipients.reduce((sum, recipient) => sum + recipient.amount, 0);

  return {
    allowed: invalidAddresses.length === 0 && duplicateAddresses.length === 0,
    recipient_count: recipients.length,
    total_amount: totalAmount,
    invalid_addresses: invalidAddresses,
    duplicate_addresses: duplicateAddresses,
    warnings: {
      unusually_large_lines: unusuallyLargeLines,
      threshold: largeLineThreshold,
    },
  };
}

export default router;
