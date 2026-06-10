import { isAddress } from 'viem';

export interface SafetyReviewLine {
  line: number;
  address: string;
  amount: number;
  label: string;
}

export interface SafetyReviewIssue {
  line: number;
  severity: 'block' | 'warning';
  message: string;
}

export interface SafetyReviewResult {
  allowed: boolean;
  recipients: SafetyReviewLine[];
  issues: SafetyReviewIssue[];
  total: number;
}

export function reviewPaymentDraft(input: string): SafetyReviewResult {
  const recipients: SafetyReviewLine[] = [];
  const issues: SafetyReviewIssue[] = [];
  const seen = new Map<string, number>();

  input.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const [address = '', amountRaw = '', ...labelParts] = trimmed.split(',').map((part) => part.trim());
    const amount = Number(amountRaw);
    const label = labelParts.join(', ');

    recipients.push({ line, address, amount, label });

    const isUsername = /^@?[a-zA-Z0-9_][a-zA-Z0-9_.-]{1,38}$/.test(address);
    if (!isAddress(address) && !isUsername) {
      issues.push({ line, severity: 'block', message: 'Invalid wallet address or username.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      issues.push({ line, severity: 'block', message: 'Amount must be greater than zero.' });
    }

    const normalized = address.toLowerCase();
    const firstLine = seen.get(normalized);
    if (address && firstLine) {
      issues.push({
        line,
        severity: 'block',
        message: `Duplicate recipient. First entered on line ${firstLine}.`,
      });
    } else if (address) {
      seen.set(normalized, line);
    }

    if (Number.isFinite(amount) && amount >= 100) {
      issues.push({ line, severity: 'warning', message: 'Large payment. Confirm the amount and policy limits.' });
    }
  });

  return {
    allowed: recipients.length > 0 && !issues.some((issue) => issue.severity === 'block'),
    recipients,
    issues,
    total: recipients.reduce((sum, recipient) => (
      Number.isFinite(recipient.amount) && recipient.amount > 0 ? sum + recipient.amount : sum
    ), 0),
  };
}
