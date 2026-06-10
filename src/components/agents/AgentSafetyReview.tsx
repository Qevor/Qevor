import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reviewPaymentDraft } from '@/lib/agents/safety-review';

interface Props {
  paymentAsset?: string;
}

export function AgentSafetyReview({ paymentAsset = 'MNT' }: Props) {
  const [draft, setDraft] = useState('');
  const [reviewedDraft, setReviewedDraft] = useState('');
  const review = useMemo(() => reviewPaymentDraft(reviewedDraft), [reviewedDraft]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Payment safety review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check a payment draft for duplicate recipients, invalid addresses, and risky amounts.
          </p>
        </div>
        <Button onClick={() => setReviewedDraft(draft)} disabled={!draft.trim()}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Review draft
        </Button>
      </div>
      <div className="space-y-4 p-5">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={'0xRecipient,1.5,Alice\n0xRecipient,2.0,Bob'}
          className="min-h-32 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {reviewedDraft ? (
          <div className={`rounded-md border p-4 ${review.allowed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">
                {review.allowed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
                {review.allowed ? 'Draft passed safety review' : 'Draft blocked by safety review'}
              </div>
              <div className="text-sm text-muted-foreground">
                {review.recipients.length} recipients · {review.total.toFixed(4)} {paymentAsset}
              </div>
            </div>
            {review.issues.length > 0 && (
              <div className="mt-3 space-y-2">
                {review.issues.map((issue, index) => (
                  <div key={`${issue.line}-${index}`} className="text-sm">
                    <span className={issue.severity === 'block' ? 'text-destructive' : 'text-amber-600'}>
                      Line {issue.line}: {issue.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Format: address, amount, label (label is optional)</div>
        )}
      </div>
    </div>
  );
}
