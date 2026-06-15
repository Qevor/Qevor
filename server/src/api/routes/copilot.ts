import { Router } from 'express';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { ByrealCliRunner } from '../../executor/byreal-cli.js';
import { MANTLE_SEPOLIA_AGENT_CHAIN } from '../../executor/chain-support.js';

const router = Router();
const byrealLog = createLogger('api').child({ route: 'copilot-byreal' });
const byreal = new ByrealCliRunner(byrealLog);
const agentExecutionPattern = /\b(agent|autonomous|automatically|autopilot)\b|\b(no approval|without approval|no human approval)\b|do(?:es)?\s+not\s+require\s+(?:my\s+)?approval|don'?t\s+require\s+(?:my\s+)?approval/;

const recipientSchema = z.object({
  wallet: z.string().max(120),
  amount: z.number().finite().nonnegative(),
  label: z.string().max(120).optional(),
});

const requestSchema = z.object({
  intent: z.string().trim().min(3).max(2000),
  current_chain: z.enum(['arc-testnet', 'mantle-sepolia']).default('arc-testnet'),
  current_recipients: z.array(recipientSchema).max(500).default([]),
  profile_wallet: z.string().max(120).optional(),
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
  const anthropicPlan = await buildAnthropicPlan(parsed.data).catch(() => null);
  const openAiPlan = anthropicPlan ? null : await buildOpenAiPlan(parsed.data).catch(() => null);
  const plan = anthropicPlan ?? openAiPlan ?? fallback;
  const executionLayer = await buildByrealExecutionLayer(plan, parsed.data).catch((err) => ({
    provider: 'byreal' as const,
    checked: true,
    allowed: false,
    configured: true,
    skipped: false,
    reason: err instanceof Error ? err.message : String(err),
  }));
  res.json({ ...plan, executionLayer });
});

function buildDeterministicPlan(input: z.infer<typeof requestSchema>) {
  const lower = input.intent.toLowerCase();
  const addressThenAmount = [...input.intent.matchAll(/(@[a-zA-Z0-9_][a-zA-Z0-9_.-]{1,38}|0x[a-fA-F0-9]{40})\s+(?:for\s+)?(\d+(?:\.\d+)?)/g)]
    .map((match) => ({ wallet: match[1], amount: Number(match[2]), label: '' }));
  const amountThenAddress = [...input.intent.matchAll(/(\d+(?:\.\d+)?)\s*(?:MNT|USDC)?\s+(?:to|for)\s+(@[a-zA-Z0-9_][a-zA-Z0-9_.-]{1,38}|0x[a-fA-F0-9]{40})/gi)]
    .map((match) => ({ wallet: match[2], amount: Number(match[1]), label: '' }));
  const extracted = dedupeRecipients([...addressThenAmount, ...amountThenAddress]);
  const currentRecipients = input.current_recipients.filter((recipient) => recipient.wallet || recipient.amount > 0);
  const recipients = extracted.length > 0 ? extracted : currentRecipients;
  const chainKey = lower.includes('mantle')
    ? 'mantle-sepolia'
    : lower.includes('arc')
      ? 'arc-testnet'
      : input.current_chain;
  const executionMode: 'human' | 'agent' = agentExecutionPattern.test(lower) ? 'agent' : 'human';
  const maxAmountMatch = lower.match(/(?:max(?:imum)?|limit(?:ed)? to)\s+(\d+(?:\.\d+)?)/);
  const warnings = recipients.length === 0 ? ['No recipients were found. Add recipients or import a CSV.'] : [];
  if (executionMode === 'agent') warnings.push('Agent execution was requested. Qevor can queue it without a wallet signature only when an eligible agent wallet and policy are selected.');
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

function dedupeRecipients(recipients: Array<z.infer<typeof recipientSchema>>) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = `${recipient.wallet.toLowerCase()}:${recipient.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePlanCandidate(candidate: unknown, input: z.infer<typeof requestSchema>) {
  const fallback = buildDeterministicPlan(input);
  const value = typeof candidate === 'object' && candidate ? candidate as Record<string, unknown> : {};
  const constraints = typeof value.constraints === 'object' && value.constraints
    ? value.constraints as Record<string, unknown>
    : {};
  const rawRecipients = Array.isArray(value.recipients) ? value.recipients : [];
  const recipients = dedupeRecipients(rawRecipients.map((recipient) => {
    const row = typeof recipient === 'object' && recipient ? recipient as Record<string, unknown> : {};
    return {
      wallet: typeof row.wallet === 'string' ? row.wallet.trim() : '',
      amount: typeof row.amount === 'number' ? row.amount : Number(row.amount),
      label: typeof row.label === 'string' ? row.label.trim() : '',
    };
  }).filter((recipient) => recipient.wallet && Number.isFinite(recipient.amount) && recipient.amount >= 0));
  const maxAmount = typeof constraints.maxAmount === 'number' ? constraints.maxAmount : Number(constraints.maxAmount);
  const chainKey = value.chainKey === 'arc-testnet' || value.chainKey === 'mantle-sepolia' ? value.chainKey : fallback.chainKey;
  const executionMode = value.executionMode === 'agent' || value.executionMode === 'human' ? value.executionMode : fallback.executionMode;
  const planRecipients = recipients.length > 0 ? recipients : fallback.recipients;
  const chainLabel = chainKey === 'mantle-sepolia' ? 'Mantle Sepolia' : 'Arc Testnet';
  const rawWarnings = Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === 'string') : fallback.warnings;
  const warnings = executionMode === 'agent'
    ? [
      'Agent execution requested. Qevor can queue this without a wallet signature only if the selected agent wallet and policy allow it.',
      ...rawWarnings.filter((warning) => !/approval|human review|human approval|not permitted|no funds will move/i.test(warning)),
    ]
    : rawWarnings;

  return {
    explanation: executionMode === 'agent'
      ? `Prepared a policy-gated ${chainLabel} agent draft for ${planRecipients.length} recipient${planRecipients.length === 1 ? '' : 's'}.`
      : typeof value.explanation === 'string' && value.explanation.trim() ? value.explanation : fallback.explanation,
    title: typeof value.title === 'string' && value.title.trim() ? value.title : fallback.title,
    description: executionMode === 'agent'
      ? `Policy-gated agent payment draft on ${chainLabel}. Autonomous execution is allowed only inside the selected agent policy.`
      : typeof value.description === 'string' && value.description.trim() ? value.description : fallback.description,
    chainKey,
    executionMode,
    recipients: planRecipients,
    constraints: {
      requireHumanApproval: true as const,
      duplicateCheck: true as const,
      maxAmount: Number.isFinite(maxAmount) && maxAmount > 0 ? maxAmount : fallback.constraints.maxAmount,
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
          content: 'Convert payment intent into a Qevor draft. Human approval is the default. If the user asks for autonomous/no-approval execution, set executionMode to agent; this means policy-gated agent execution, not unsafe bypass. Keep constraints.requireHumanApproval true as the draft-level safety marker. Never execute funds, and preserve supplied recipients when the instruction refers to them.',
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

async function buildAnthropicPlan(input: z.infer<typeof requestSchema>) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_COPILOT_MODEL;
  if (!apiKey || !model) return null;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0,
      system: [
        'Convert payment intent into a Qevor payment draft.',
        'Human approval is the default. If the user asks for autonomous/no-approval execution, set executionMode to agent; this means policy-gated agent execution, not unsafe bypass.',
        'Keep constraints.requireHumanApproval true as the draft-level safety marker even for agent mode.',
        'Never execute funds, preserve supplied recipients when the instruction refers to them, and return only JSON.',
        'The JSON must include explanation, title, description, chainKey, executionMode, recipients, constraints, and warnings.',
        'chainKey must be arc-testnet or mantle-sepolia. executionMode must be human or agent.',
        'constraints.requireHumanApproval and constraints.duplicateCheck must both be true.',
        'Every recipient must include wallet, amount, and label. Use an empty string for label when unknown.',
        'If the intent says "0.01 MNT to 0x..." then create one recipient with that address and amount 0.01.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;

  const payload = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const outputText = payload.content?.find((item) => item.type === 'text' && item.text)?.text;
  if (!outputText) return null;

  const jsonText = stripJsonFence(outputText);
  const parsed = planSchema.safeParse(normalizePlanCandidate(JSON.parse(jsonText), input));
  if (!parsed.success) {
    byrealLog.warn({
      provider: 'anthropic',
      issues: parsed.error.issues.map((issue) => issue.path.join('.')).filter(Boolean),
    }, 'Claude copilot plan failed validation');
  }
  return parsed.success ? { source: 'anthropic' as const, ...parsed.data } : null;
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

async function buildByrealExecutionLayer(
  plan: z.infer<typeof planSchema> & { source: 'anthropic' | 'openai' | 'deterministic' },
  input: z.infer<typeof requestSchema>,
) {
  if (plan.chainKey !== 'mantle-sepolia') {
    return {
      provider: 'byreal' as const,
      checked: false,
      allowed: true,
      configured: false,
      skipped: true,
      reason: 'Byreal preflight is only required for Mantle agent operations.',
    };
  }

  const status = await byreal.status();
  if (!status.available) {
    return {
      provider: 'byreal' as const,
      checked: true,
      allowed: true,
      configured: false,
      skipped: true,
      reason: status.reason ?? 'Byreal CLI is not configured.',
    };
  }

  if (!process.env.BYREAL_PREFLIGHT_ARGS?.trim()) {
    return {
      provider: 'byreal' as const,
      checked: true,
      allowed: true,
      configured: false,
      skipped: true,
      reason: 'BYREAL_PREFLIGHT_ARGS is not configured.',
    };
  }

  const validRecipients = plan.recipients.filter((recipient) => /^0x[a-fA-F0-9]{40}$/.test(recipient.wallet));
  const firstRecipient = validRecipients[0];
  const fromAddress = input.profile_wallet && /^0x[a-fA-F0-9]{40}$/.test(input.profile_wallet)
    ? input.profile_wallet
    : firstRecipient?.wallet;

  if (!fromAddress || !firstRecipient) {
    return {
      provider: 'byreal' as const,
      checked: true,
      allowed: true,
      configured: true,
      skipped: true,
      reason: 'Byreal CLI is configured; add a valid Mantle recipient before transfer preflight.',
    };
  }

  const totalAmount = plan.recipients.reduce((sum, recipient) => sum + recipient.amount, 0);
  const result = await byreal.preflight({
    chain: MANTLE_SEPOLIA_AGENT_CHAIN,
    fromAddress,
    toAddress: firstRecipient.wallet,
    amount: String(totalAmount),
    paymentId: `copilot:${Date.now()}`,
    policyDecision: 'cosign_required',
  });

  return {
    provider: 'byreal' as const,
    checked: true,
    allowed: result.allowed,
    configured: true,
    skipped: result.skipped === true,
    reason: result.reason ?? (result.allowed ? 'Byreal preflight accepted the Mantle operation.' : 'Byreal preflight blocked the Mantle operation.'),
  };
}

export default router;
