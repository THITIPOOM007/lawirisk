import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGeminiModelDiscoveryCacheForTests,
  discoverGeminiGenerationModels,
} from './gemini-model-discovery';

describe('Gemini model discovery', () => {
  afterEach(() => {
    clearGeminiModelDiscoveryCacheForTests();
    vi.unstubAllGlobals();
  });

  it('keeps only safe generateContent models and prefers the configured available model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [
      { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ] }), { status: 200 })));

    await expect(discoverGeminiGenerationModels('key', 'gemini-3.7-flash')).resolves.toEqual([
      'gemini-3.7-flash',
      'gemini-3.5-flash',
    ]);
  });

  it('fails closed when the model-list request rejects the API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    await expect(discoverGeminiGenerationModels('bad-key')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});
