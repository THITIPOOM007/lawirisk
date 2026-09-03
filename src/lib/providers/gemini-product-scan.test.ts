import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeProductImagesWithGemini } from './gemini-product-scan';
import { clearGeminiModelDiscoveryCacheForTests } from './gemini-model-discovery';

function modelListResponse() {
  return new Response(JSON.stringify({
    models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function successfulResponse() {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            summary: 'อ่านได้ว่าเป็นผลิตภัณฑ์เสริมอาหาร แต่ภาพมีเพียงด้านหน้า',
            productName: 'ตัวอย่างผลิตภัณฑ์',
            brand: 'ตัวอย่างแบรนด์',
            productCategory: 'ผลิตภัณฑ์เสริมอาหาร',
            visibleText: ['ตัวอย่างผลิตภัณฑ์'],
            identifiers: [{ type: 'FDA_NUMBER', value: '10-1-12345-5-0001' }],
            generalInformation: ['ฉลากระบุว่าเป็นผลิตภัณฑ์เสริมอาหาร'],
            concernLevel: 'REVIEW',
            concernSignals: [{ label: 'ภาพไม่ครบทุกด้าน', detail: 'ยังไม่เห็นส่วนประกอบและคำเตือน', evidence: null }],
            positiveSignals: ['อ่านข้อความชื่อผลิตภัณฑ์ได้'],
            recommendedActions: ['นำเลขที่พบไปตรวจสอบกับฐานข้อมูล อย.'],
            confidence: 0.78,
            limitations: ['ภาพเดียวไม่สามารถยืนยันความแท้หรือสถานะทะเบียนได้'],
          }),
        }],
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function uploadStartResponse(index: number) {
  return new Response('', { status: 200, headers: { 'x-goog-upload-url': `https://upload.example/${index}` } });
}

function uploadFinalizeResponse(index: number, mimeType = 'image/jpeg') {
  return new Response(JSON.stringify({
    file: { name: `files/product-view-${index}`, uri: `https://generativelanguage.googleapis.com/v1beta/files/product-view-${index}`, mimeType },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Gemini public product scan', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-provider-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash');
    clearGeminiModelDiscoveryCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearGeminiModelDiscoveryCacheForTests();
  });

  it('uploads multiple images, analyzes them together, and deletes the temporary files', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(modelListResponse())
      .mockResolvedValueOnce(uploadStartResponse(1))
      .mockResolvedValueOnce(uploadFinalizeResponse(1))
      .mockResolvedValueOnce(uploadStartResponse(2))
      .mockResolvedValueOnce(uploadFinalizeResponse(2, 'image/png'))
      .mockResolvedValueOnce(successfulResponse())
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await analyzeProductImagesWithGemini([
      { file: new Blob(['first'], { type: 'image/jpeg' }), mimeType: 'image/jpeg' },
      { file: new Blob(['second'], { type: 'image/png' }), mimeType: 'image/png' },
    ]);

    expect(response.result.concernLevel).toBe('REVIEW');
    expect(response.result.identifiers[0]).toEqual({ type: 'FDA_NUMBER', value: '10-1-12345-5-0001' });
    const request = JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body));
    expect(request.contents[0].parts.slice(0, 2)).toEqual([
      { fileData: { fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/product-view-1', mimeType: 'image/jpeg' } },
      { fileData: { fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/product-view-2', mimeType: 'image/png' } },
    ]);
    expect(request.systemInstruction.parts[0].text).toContain('Never claim that a product is genuine');
    expect(request.generationConfig.maxOutputTokens).toBe(4096);
    expect(fetchMock.mock.calls[6]?.[1]?.method).toBe('DELETE');
    expect(fetchMock.mock.calls[7]?.[1]?.method).toBe('DELETE');
  });

  it('rejects output that invents an unsupported concern level', async () => {
    const invalid = successfulResponse();
    const body = await invalid.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const decoded = JSON.parse(body.candidates[0].content.parts[0].text);
    decoded.concernLevel = 'COUNTERFEIT';
    body.candidates[0].content.parts[0].text = JSON.stringify(decoded);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(modelListResponse())
      .mockResolvedValueOnce(uploadStartResponse(1))
      .mockResolvedValueOnce(uploadFinalizeResponse(1, 'image/png'))
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('', { status: 200 })));

    await expect(analyzeProductImagesWithGemini([
      { file: new Blob(['image'], { type: 'image/png' }), mimeType: 'image/png' },
    ])).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });
});
