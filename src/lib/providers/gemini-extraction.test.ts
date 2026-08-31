import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractEntitiesWithGemini } from './gemini-extraction';
import { clearGeminiModelDiscoveryCacheForTests } from './gemini-model-discovery';

function modelListResponse(models = ['gemini-3.5-flash', 'gemini-3.5-flash-lite']) {
  return new Response(JSON.stringify({
    models: models.map((model) => ({
      name: `models/${model}`,
      supportedGenerationMethods: ['generateContent'],
    })),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function successfulResponse() {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            candidates: [{
              entity_type: 'PHONE',
              candidate_value: '080-000-0000',
              confidence: 0.92,
              reason: 'พบหมายเลขโทรศัพท์โดยตรงในข้อความต้นทาง',
            }],
          }),
        }],
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Gemini extraction resilience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('GEMINI_API_KEY', 'test-provider-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash');
    clearGeminiModelDiscoveryCacheForTests();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearGeminiModelDiscoveryCacheForTests();
  });

  it('retries a transient 503 with backoff and succeeds without switching model', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelListResponse())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(successfulResponse());
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = extractEntitiesWithGemini('ติดต่อ 080-000-0000');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.model).toBe('gemini-3.5-flash');
    expect(result.candidates).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('selects a current compatible model when the configured model is not available', async () => {
    vi.stubEnv('GEMINI_MODEL', 'retired-model');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelListResponse(['gemini-3.5-flash-lite']))
      .mockResolvedValueOnce(successfulResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractEntitiesWithGemini('ข้อมูลทดสอบ');

    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('gemini-3.5-flash-lite');
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('gemini-1.5');
  });

  it('fails immediately with an actionable classification for a rejected API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(extractEntitiesWithGemini('ข้อมูลทดสอบ')).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies exhausted transient retries without fabricating extraction output', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelListResponse())
      .mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = extractEntitiesWithGemini('ข้อมูลทดสอบ');
    const assertion = expect(resultPromise).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
