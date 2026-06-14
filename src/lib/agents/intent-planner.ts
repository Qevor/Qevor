import type { QevorChainKey } from '@/lib/chains';

export interface CopilotRecipient {
  wallet: string;
  amount: number;
  label?: string;
}

export interface PaymentIntentPlan {
  source: 'anthropic' | 'openai' | 'deterministic';
  explanation: string;
  title: string;
  description: string;
  chainKey: QevorChainKey;
  executionMode: 'human' | 'agent';
  recipients: CopilotRecipient[];
  constraints: {
    requireHumanApproval: boolean;
    duplicateCheck: boolean;
    maxAmount: number | null;
  };
  warnings: string[];
  executionLayer?: {
    provider: 'byreal';
    checked: boolean;
    allowed: boolean;
    configured: boolean;
    skipped: boolean;
    reason: string | null;
  };
}

export interface PaymentIntentContext {
  currentChainKey: QevorChainKey;
  currentRecipients?: CopilotRecipient[];
  profileWallet?: string;
}

const walletPattern = '@[a-zA-Z0-9_][a-zA-Z0-9_.-]{1,38}|0x[a-fA-F0-9]{40}';
const walletThenAmountPattern = new RegExp(`(${walletPattern})\\s+(?:for\\s+)?(\\d+(?:\\.\\d+)?)`, 'g');
const amountThenWalletPattern = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(?:MNT|USDC|USDT|ETH)?\\s+(?:to|for)\\s+(${walletPattern})`,
  'gi',
);

export function planPaymentIntentLocally(intent: string, context: PaymentIntentContext): PaymentIntentPlan {
  const normalized = intent.trim();
  const lower = normalized.toLowerCase();
  const recipients = parseRecipients(normalized);
  const contextRecipients = (context.currentRecipients ?? []).filter((recipient) => recipient.wallet || recipient.amount > 0);
  const useContextRecipients = recipients.length === 0 && contextRecipients.length > 0;
  const chainKey = lower.includes('mantle')
    ? 'mantle-sepolia'
    : lower.includes('arc')
      ? 'arc-testnet'
      : context.currentChainKey;
  const requestsAgent = /\b(agent|autonomous|automatically|autopilot)\b/.test(lower);
  const maxAmountMatch = lower.match(/(?:max(?:imum)?|limit(?:ed)? to)\s+(\d+(?:\.\d+)?)/);
  const warnings: string[] = [];
  const plannedRecipients = useContextRecipients ? contextRecipients : recipients;

  if (recipients.length === 0 && !useContextRecipients) {
    warnings.push('No recipients were found. Add recipients manually or import a CSV before applying the plan.');
  }
  if (requestsAgent) {
    warnings.push('Agent execution was requested, but human approval remains required until an eligible agent policy is selected.');
  }
  if (plannedRecipients.some((recipient) => recipient.wallet.startsWith('@'))) {
    warnings.push('Qevor usernames are unverified in this draft and must resolve to a wallet before payment.');
  }

  const recipientCount = plannedRecipients.length;

  return {
    source: 'deterministic',
    explanation: recipientCount > 0
      ? `Prepared a ${chainKey === 'mantle-sepolia' ? 'Mantle Sepolia' : 'Arc Testnet'} payment draft for ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}.`
      : `Selected ${chainKey === 'mantle-sepolia' ? 'Mantle Sepolia' : 'Arc Testnet'} and preserved the human approval boundary.`,
    title: inferTitle(normalized),
    description: normalized,
    chainKey,
    executionMode: requestsAgent ? 'agent' : 'human',
    recipients: plannedRecipients,
    constraints: {
      requireHumanApproval: true,
      duplicateCheck: true,
      maxAmount: maxAmountMatch ? Number(maxAmountMatch[1]) : null,
    },
    warnings,
  };
}

export async function planPaymentIntent(
  intent: string,
  context: PaymentIntentContext,
): Promise<PaymentIntentPlan> {
  const fallback = planPaymentIntentLocally(intent, context);
  const apiUrl = import.meta.env.VITE_QEVOR_API_URL?.replace(/\/$/, '');
  if (!apiUrl) return fallback;

  try {
    const response = await fetch(`${apiUrl}/api/copilot/plan-payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intent,
        current_chain: context.currentChainKey,
        current_recipients: context.currentRecipients ?? [],
        profile_wallet: context.profileWallet,
      }),
    });
    if (!response.ok) return fallback;
    return await response.json() as PaymentIntentPlan;
  } catch {
    return fallback;
  }
}

function parseRecipients(intent: string): CopilotRecipient[] {
  const recipients: CopilotRecipient[] = [];
  const seen = new Set<string>();

  const addRecipient = (wallet: string, amount: string) => {
    const key = `${wallet.toLowerCase()}:${amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({ wallet, amount: Number(amount), label: '' });
  };

  for (const match of intent.matchAll(walletThenAmountPattern)) {
    addRecipient(match[1], match[2]);
  }
  for (const match of intent.matchAll(amountThenWalletPattern)) {
    addRecipient(match[2], match[1]);
  }
  return recipients;
}

function inferTitle(intent: string): string {
  if (/\b(payroll|salary|salaries)\b/i.test(intent)) return 'Agent-assisted payroll';
  if (/\b(contributor|contributors)\b/i.test(intent)) return 'Contributor payments';
  if (/\b(invoice|invoices)\b/i.test(intent)) return 'Invoice payments';
  return 'Copilot payment plan';
}
