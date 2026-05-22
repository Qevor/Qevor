import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signBody, sendSettlementWebhook, type SettlementEvent } from './notary-webhook.js';

const event: SettlementEvent = {
  batch_request_id: 'b-1',
  batch_payment_id: 'p-1',
  attestation_id: '0x' + 'a'.repeat(64),
  obligation_id: 'obl-1',
  state: 'paid',
  amount_usdc: 50,
  recipient_wallet: '0x0000000000000000000000000000000000000001',
  tx_hash: '0xdeadbeef',
  emitted_at: '2026-05-22T00:00:00.000Z',
};

describe('signBody', () => {
  it('produces a stable HMAC-SHA256 hex digest', () => {
    const sig = signBody('s3cret', '{"hello":"world"}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // Same input → same output.
    expect(signBody('s3cret', '{"hello":"world"}')).toBe(sig);
    // Different secret → different digest.
    expect(signBody('other', '{"hello":"world"}')).not.toBe(sig);
  });
});

describe('sendSettlementWebhook', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns not-delivered if no url/secret configured', async () => {
    const result = await sendSettlementWebhook({ url: null, secret: null }, event);
    expect(result.delivered).toBe(false);
    expect(result.error).toBe('webhook_not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signs the body with the configured header and secret', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await sendSettlementWebhook(
      { url: 'https://notary.example/webhook', secret: 'sssh' },
      event,
    );
    expect(result.delivered).toBe(true);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('https://notary.example/webhook');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = init.body as string;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-signature']).toBe(signBody('sssh', body));
    // Body must be deterministic JSON of the event.
    expect(JSON.parse(body)).toMatchObject({ batch_payment_id: 'p-1', state: 'paid' });
  });

  it('honors a custom signature header name', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
    await sendSettlementWebhook(
      {
        url: 'https://notary.example/webhook',
        secret: 'sssh',
        signatureHeader: 'x-notary-signature',
      },
      event,
    );
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-notary-signature']).toBeDefined();
    expect(headers['x-signature']).toBeUndefined();
  });

  it('returns delivered=false on non-2xx', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503 } as Response);
    const result = await sendSettlementWebhook(
      { url: 'https://notary.example/webhook', secret: 'sssh' },
      event,
    );
    expect(result.delivered).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.error).toBe('notary_webhook_status_503');
  });

  it('returns delivered=false on network throw', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendSettlementWebhook(
      { url: 'https://notary.example/webhook', secret: 'sssh' },
      event,
    );
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
