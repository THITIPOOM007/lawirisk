import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consumeRateLimit } from './rate-limit';

vi.mock('server-only', () => ({}));

describe('rate-limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0)); // August 20, 2026 12:00:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows request if within demo limit', async () => {
    const result1 = await consumeRateLimit({ key: 'test1', limit: 2, windowSeconds: 60 });
    expect(result1.allowed).toBe(true);

    const result2 = await consumeRateLimit({ key: 'test1', limit: 2, windowSeconds: 60 });
    expect(result2.allowed).toBe(true);
  });

  it('blocks request if demo limit exceeded', async () => {
    await consumeRateLimit({ key: 'test2', limit: 1, windowSeconds: 60 });
    const result = await consumeRateLimit({ key: 'test2', limit: 1, windowSeconds: 60 });
    
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it('resets demo limit after window', async () => {
    await consumeRateLimit({ key: 'test3', limit: 1, windowSeconds: 60 });
    
    let result = await consumeRateLimit({ key: 'test3', limit: 1, windowSeconds: 60 });
    expect(result.allowed).toBe(false);

    vi.advanceTimersByTime(60001); // advance by 60 seconds

    result = await consumeRateLimit({ key: 'test3', limit: 1, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });

  it('delegates to supabase rpc if client provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: { allowed: false, retry_after_seconds: 30 }, error: null });
    
    const client = { rpc: mockRpc } as any;
    
    const result = await consumeRateLimit({ client, key: 'test-rpc', limit: 5, windowSeconds: 10 });
    
    expect(mockRpc).toHaveBeenCalledWith('consume_api_rate_limit', {
      p_key: 'test-rpc',
      p_limit: 5,
      p_window_seconds: 10
    });
    
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(30);
  });
});
