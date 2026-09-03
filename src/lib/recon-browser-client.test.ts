import { describe, expect, it } from 'vitest';
import { LOCAL_BRIDGE_CAPTURE_PROTOCOL, validateLocalBridgeHealth } from './recon-browser-client';

describe('local Recon Companion compatibility', () => {
  it('accepts a ready companion with the current evidence-capture protocol', () => {
    expect(validateLocalBridgeHealth({
      status: 'ready',
      transport: 'loopback-only',
      version: '2026.09.03.2',
      captureProtocol: LOCAL_BRIDGE_CAPTURE_PROTOCOL,
    })).toEqual({ version: '2026.09.03.2' });
  });

  it('stops an old companion before it can create a PDF-only capture', () => {
    expect(() => validateLocalBridgeHealth({ status: 'ready', transport: 'loopback-only' }))
      .toThrow('เป็นรุ่นเก่า');
  });

  it('rejects an invalid local health response', () => {
    expect(() => validateLocalBridgeHealth({ status: 'offline' }))
      .toThrow('ตอบสถานะไม่ถูกต้อง');
  });
});
