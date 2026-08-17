import crypto from 'node:crypto';

type SignedWebhookInput = {
  secret: string;
  timestamp: string;
  nonce: string;
  payload: string;
  signature: string;
  nowSeconds?: number;
  maxDriftSeconds?: number;
};

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: 'INVALID_TIMESTAMP' | 'EXPIRED' | 'INVALID_SIGNATURE' };

export function verifySignedWebhook({
  secret,
  timestamp,
  nonce,
  payload,
  signature,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxDriftSeconds = 300,
}: SignedWebhookInput): WebhookVerification {
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt)) return { ok: false, reason: 'INVALID_TIMESTAMP' };
  if (Math.abs(nowSeconds - sentAt) > maxDriftSeconds) return { ok: false, reason: 'EXPIRED' };
  if (!/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: 'INVALID_SIGNATURE' };

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${payload}`)
    .digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
    ? { ok: true }
    : { ok: false, reason: 'INVALID_SIGNATURE' };
}
