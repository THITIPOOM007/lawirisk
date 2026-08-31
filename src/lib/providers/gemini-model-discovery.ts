import 'server-only';

import { z } from 'zod';

const MODEL_CACHE_TTL_MS = 5 * 60_000;
const DISCOVERY_TIMEOUT_MS = 8_000;
const MAX_CANDIDATES = 4;
const DEFAULT_PRIORITIES = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
] as const;

const modelsEnvelopeSchema = z.object({
  models: z.array(z.object({
    name: z.string(),
    supportedGenerationMethods: z.array(z.string()).optional(),
    supportedActions: z.array(z.string()).optional(),
  }).passthrough()).default([]),
}).passthrough();

type CacheEntry = { key: string; expiresAt: number; models: string[] };
let cache: CacheEntry | null = null;

export class GeminiModelDiscoveryError extends Error {
  constructor(
    public readonly code: 'AUTH_FAILED' | 'NO_COMPATIBLE_MODEL',
    message: string,
  ) {
    super(message);
    this.name = 'GeminiModelDiscoveryError';
  }
}

function normalizeModelName(name: string) {
  return name.trim().replace(/^models\//, '');
}

function isSafeGenerationModel(model: string) {
  const normalized = model.toLowerCase();
  return normalized.startsWith('gemini-')
    && !/(embedding|aqa|image|imagen|live|native-audio|robotics|tts|transcri)/.test(normalized);
}

function prioritize(models: string[], configuredModel?: string) {
  const available = new Set(models);
  const configured = normalizeModelName(configuredModel || '');
  const ordered = [
    ...(configured && available.has(configured) ? [configured] : []),
    ...DEFAULT_PRIORITIES.filter((model) => available.has(model)),
    ...models.filter(isSafeGenerationModel).sort(),
  ];
  return [...new Set(ordered)].slice(0, MAX_CANDIDATES);
}

export async function discoverGeminiGenerationModels(apiKey: string, configuredModel?: string) {
  const cacheKey = normalizeModelName(configuredModel || '');
  if (cache?.key === cacheKey && cache.expiresAt > Date.now()) return cache.models;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
      signal: controller.signal,
      headers: { 'x-goog-api-key': apiKey },
    });
    if (response.status === 401 || response.status === 403) {
      throw new GeminiModelDiscoveryError('AUTH_FAILED', 'Gemini rejected the configured API key');
    }
    if (!response.ok) throw new Error(`Gemini model discovery failed (${response.status})`);

    const envelope = modelsEnvelopeSchema.safeParse(await response.json().catch(() => null));
    if (!envelope.success) throw new Error('Gemini model discovery returned an invalid envelope');
    const compatible = envelope.data.models.flatMap((model) => {
      const methods = [...(model.supportedGenerationMethods || []), ...(model.supportedActions || [])];
      const name = normalizeModelName(model.name);
      return methods.some((method) => method.toLowerCase() === 'generatecontent') && isSafeGenerationModel(name)
        ? [name]
        : [];
    });
    const models = prioritize([...new Set(compatible)], configuredModel);
    if (!models.length) {
      throw new GeminiModelDiscoveryError('NO_COMPATIBLE_MODEL', 'No compatible Gemini generation model is available');
    }
    cache = { key: cacheKey, expiresAt: Date.now() + MODEL_CACHE_TTL_MS, models };
    return models;
  } catch (error: unknown) {
    if (error instanceof GeminiModelDiscoveryError) throw error;
    // Keep a bounded current-model fallback for temporary failure of the list endpoint.
    const models = [...new Set([normalizeModelName(configuredModel || ''), ...DEFAULT_PRIORITIES])]
      .filter(isSafeGenerationModel)
      .slice(0, MAX_CANDIDATES);
    cache = { key: cacheKey, expiresAt: Date.now() + 30_000, models };
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

export function clearGeminiModelDiscoveryCacheForTests() {
  cache = null;
}
