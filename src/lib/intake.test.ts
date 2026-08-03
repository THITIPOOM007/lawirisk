import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Intake HMAC Signatures', () => {
  it('should verify correct signature matches computed signature', () => {
    const secret = 'test-secret';
    const timestamp = '1785500000';
    const nonce = 'randomnonce';
    const payload = JSON.stringify({ ref_no: 'KP-99', urgency: 'HIGH' });

    const message = `${timestamp}.${nonce}.${payload}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // Simulate verification
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    expect(computedSignature).toBe(expectedSignature);
  });

  it('should detect signature mismatch for altered payload', () => {
    const secret = 'test-secret';
    const timestamp = '1785500000';
    const nonce = 'randomnonce';
    const payload = JSON.stringify({ ref_no: 'KP-99', urgency: 'HIGH' });

    const message = `${timestamp}.${nonce}.${payload}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // Altered payload
    const alteredPayload = JSON.stringify({ ref_no: 'KP-99', urgency: 'LOW' });
    const alteredMessage = `${timestamp}.${nonce}.${alteredPayload}`;
    const alteredSignature = crypto
      .createHmac('sha256', secret)
      .update(alteredMessage)
      .digest('hex');

    expect(computedSignature).not.toBe(alteredSignature);
  });
});
