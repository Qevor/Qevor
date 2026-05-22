// Outbound webhook to NOTARY notifying it of payment settlement state.
// Signed HMAC-SHA256 over the raw request body, header name and secret match
// NOTARY's verify_webhook implementation in notary/services/qevorpay.py.

import { createHmac } from 'node:crypto';
import type { Logger } from 'pino';

export interface NotaryWebhookConfig {
  url: string | null;
  secret: string | null;
  signatureHeader?: string; // default 'x-signature'
  timeoutMs?: number; // default 10_000
}

export type SettlementState = 'paid' | 'failed' | 'blocked' | 'cosign_required';

export interface SettlementEvent {
  batch_request_id: string;
  batch_payment_id: string;
  attestation_id: string | null;
  obligation_id: string | null;
  state: SettlementState;
  amount_usdc: number;
  recipient_wallet: string;
  tx_hash?: string;
  reason?: string;
  emitted_at: string; // ISO timestamp
}

export interface WebhookDelivery {
  delivered: boolean;
  statusCode?: number;
  error?: string;
}

export function signBody(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export async function sendSettlementWebhook(
  cfg: NotaryWebhookConfig,
  event: SettlementEvent,
  log?: Logger,
): Promise<WebhookDelivery> {
  if (!cfg.url || !cfg.secret) {
    // No webhook configured. Caller will record this on the row.
    return { delivered: false, error: 'webhook_not_configured' };
  }
  const headerName = cfg.signatureHeader ?? 'x-signature';
  const timeoutMs = cfg.timeoutMs ?? 10_000;
  const body = JSON.stringify(event);
  const signature = signBody(cfg.secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        [headerName]: signature,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        delivered: false,
        statusCode: res.status,
        error: `notary_webhook_status_${res.status}`,
      };
    }
    return { delivered: true, statusCode: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.warn({ err: msg, url: cfg.url }, 'notary settlement webhook failed');
    return { delivered: false, error: msg.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}
