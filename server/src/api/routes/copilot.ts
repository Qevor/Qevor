import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const recipientSchema = z.object({
  wallet: z.string().max(120),
  amount: z.number().finite().nonnegative(),
  label: z.string().max(120).optional(),
});

const requestSchema = z.object({
  intent: z.string().trim().min(3).max(2000),
  current_chain: z.enum(['arc-testnet', 'mantle-sepolia']).default('arc-testnet'),
  current_recipients: z.array(recipientSchema).max(500).default([]),
});

const planSchema = z.object({
  explanation: z.string(),
  title: z.string(),
  description: z.string(),
  chainKey: z.enum(['arc-testnet', 'mantle-sepolia']),
  executionMode: z.enum(['human', 'agent']),
  recipients: z.array(recipientSchema),
  constraints: z.object({
    requireHumanApproval: z.literal(true),
    duplicateCheck: z.literal(true),
    maxAmount: z.number().positive().nullable(),
  }),
  warnings: z.array(z.string()),
});

router.post('/plan-payment', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const fallback = buildDeterministicPlan(parsed.data);
  const openAiPlan = await buildOpenAiPlan(parsed.data).catch(() => null);
  res.json(openAiPlan ?? fallback);
});

function buildDeterministicPlan(input: z.infer<typeof requestSchema>) {
  const lower = input.intent.toLowerCase();
  const matches = [...input.intent.matchAll(/(@[a-zA-Z0-9_][a-zA-Z0-9_.-]{1,38}|0x[a-fA-F0-9]{40})\s+(?:for\s+)?(\d+(?:\.\d+)?)/g)];
  const extracted = matches.map((match) => ({ wallet: match[1], amount: Number(match[2]), label: '' }));
  const currentRecipients = input.current_recipients.filter((recipient) => recipient.wallet || recipient.amount > 0);
  const recipients = extracted.length > 0 ? extracted : currentRecipients;
  const chainKey = lower.includes('mantle')
    ? 'mantle-sepolia'
    : lower.includes('arc')
      ? 'arc-testnet'
      : input.current_chain;
  const executionMode = /\b(agent|autonomous|automatically|autopilot)\b/.test(lower) ? 'agent' : 'human';
  const maxAmountMatch = lower.match(/(?:max(?:imum)?|limit(?:ed)? to)\s+(\d+(?:\.\d+)?)/);
  const warnings = recipients.length === 0 ? ['No recipients were found. Add recipients or import a CSV.'] : [];
  if (executionMode === 'agent') warnings.push('Human approval remains required until an eligible agent policy is selected.');
  if (recipients.some((recipient) => recipient.wallet.startsWith('@'))) {
    warnings.push('Qevor usernames are unverified in this draft and must resolve to a wallet before payment.');
  }

  return {
    source: 'deterministic' as const,
    explanation: `Prepared a ${chainKey === 'mantle-sepolia' ? 'Mantle Sepolia' : 'Arc Testnet'} draft for ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`,
    title: 'Copilot payment plan',
    description: input.intent,
    chainKey,
    executionMode,
    recipients,
    constraints: {
      requireHumanApproval: true as const,
      duplicateCheck: true as const,
      maxAmount: maxAmountMatch ? Number(maxAmountMatch[1]) : null,
    },
    warnings,
  };
}

async function buildOpenAiPlan(input: z.infer<typeof requestSchema>) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_COPILOT_MODEL;
  if (!apiKey || !model) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'Convert payment intent into a Qevor draft. Never remove human approval, never execute funds, and preserve supplied recipients when the instruction refers to them.',
        },
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'qevor_payment_plan',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['explanation', 'title', 'description', 'chainKey', 'executionMode', 'recipients', 'constraints', 'warnings'],
            properties: {
              explanation: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              chainKey: { type: 'string', enum: ['arc-testnet', 'mantle-sepolia'] },
              executionMode: { type: 'string', enum: ['human', 'agent'] },
              recipients: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['wallet', 'amount', 'label'],
                  properties: {
                    wallet: { type: 'string' },
                    amount: { type: 'number' },
                    label: { type: 'string' },
                  },
                },
              },
              constraints: {
                type: 'object',
                additionalProperties: false,
                required: ['requireHumanApproval', 'duplicateCheck', 'maxAmount'],
                properties: {
                  requireHumanApproval: { type: 'boolean', const: true },
                  duplicateCheck: { type: 'boolean', const: true },
                  maxAmount: { type: ['number', 'null'] },
                },
              },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;

  const payload = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText = payload.output_text
    ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!outputText) return null;
  const parsed = planSchema.safeParse(JSON.parse(outputText));
  return parsed.success ? { source: 'openai' as const, ...parsed.data } : null;
}

export default router;
