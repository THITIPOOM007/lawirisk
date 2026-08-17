import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignedWebhook } from './webhook-security';

const signedFixture = () => {
  const secret = 'synthetic-test-secret';
  const timestamp = '1785500000';
  const nonce = 'synthetic-nonce';
  const payload = JSON.stringify({ ref_no: 'SYNTHETIC-99', urgency: 'HIGH' });
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${payload}`).digest('hex');
  return { secret, timestamp, nonce, payload, signature, nowSeconds: 1785500000 };
};

describe('signed intake webhook verification', () => {
  it('accepts a valid signature inside the replay window', () => {
    expect(verifySignedWebhook(signedFixture())).toEqual({ ok: true });
  });

  it('rejects a payload altered after signing', () => {
    const fixture = signedFixture();
    const result = verifySignedWebhook({ ...fixture, payload: `${fixture.payload} ` });
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('rejects a correctly signed request outside the replay window', () => {
    const result = verifySignedWebhook({ ...signedFixture(), nowSeconds: 1785500301 });
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects malformed hexadecimal signatures', () => {
    const result = verifySignedWebhook({ ...signedFixture(), signature: 'not-hex' });
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE' });
  });
});
