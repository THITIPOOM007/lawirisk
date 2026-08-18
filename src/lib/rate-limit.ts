import 'server-only';

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

const demoBuckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function consumeRateLimit(input: {
  client?: RpcClient;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  if (input.client) {
    const { data, error } = await input.client.rpc('consume_api_rate_limit', {
      p_key: input.key,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    });
    if (error) {
      throw new Error(`RATE_LIMIT_UNAVAILABLE:${error.code || 'UNKNOWN'}`);
    }
    const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;
    return {
      allowed: result?.allowed === true,
      retryAfterSeconds: Math.max(0, Number(result?.retry_after_seconds || 0)),
    };
  }

  const now = Date.now();
  const existing = demoBuckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    demoBuckets.set(input.key, { count: 1, resetAt: now + input.windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= input.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}
