import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifySignedWebhook } from './webhook-security';

describe('webhook-security', () => {
  const secret = 'super-secret-key-12345678901234567890';
  const now = Math.floor(Date.now() / 1000);

  it('rejects invalid timestamp', () => {
    const result = verifySignedWebhook({
      secret,
      timestamp: 'not-a-number',
      nonce: 'abc',
      payload: '{}',
      signature: 'dummy',
      nowSeconds: now,
    });
    expect(result).toEqual({ ok: false, reason: 'INVALID_TIMESTAMP' });
  });

  it('rejects expired timestamp', () => {
    const result = verifySignedWebhook({
      secret,
      timestamp: String(now - 400),
      nonce: 'abc',
      payload: '{}',
      signature: 'dummy',
      nowSeconds: now,
      maxDriftSeconds: 300,
    });
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects invalid signature format', () => {
    const result = verifySignedWebhook({
      secret,
      timestamp: String(now),
      nonce: 'abc',
      payload: '{}',
      signature: 'short',
      nowSeconds: now,
    });
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('accepts valid signature', () => {
    const timestamp = String(now);
    const nonce = 'abc';
    const payload = '{"test":true}';
    
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${payload}`)
      .digest('hex');

    const result = verifySignedWebhook({
      secret,
      timestamp,
      nonce,
      payload,
      signature,
      nowSeconds: now,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects tampered payload', () => {
    const timestamp = String(now);
    const nonce = 'abc';
    const payload = '{"test":true}';
    
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${payload}`)
      .digest('hex');

    const result = verifySignedWebhook({
      secret,
      timestamp,
      nonce,
      payload: '{"test":false}', // tampered
      signature,
      nowSeconds: now,
    });
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE' });
  });
});
