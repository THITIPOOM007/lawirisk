import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function requestWithFiles(files: Array<{ name: string; type: string; bytes: number[] }>) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', new File([new Uint8Array(file.bytes)], file.name, { type: file.type })));
  return new NextRequest('http://localhost/api/v1/public/product-scan', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'user-agent': 'vitest' },
    body: formData,
  });
}

describe('public product scan route validation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects cross-origin uploads before parsing their body', async () => {
    const request = new NextRequest('http://localhost/api/v1/public/product-scan', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'UNTRUSTED_ORIGIN' } });
  });

  it('rejects an extension and MIME type outside the allowlist', async () => {
    const response = await POST(requestWithFiles([{ name: 'product.webp', type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'UNSUPPORTED_IMAGE' } });
  });

  it('rejects a renamed file when the magic bytes do not match', async () => {
    const response = await POST(requestWithFiles([{ name: 'product.png', type: 'image/png', bytes: [0x25, 0x50, 0x44, 0x46] }]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_IMAGE' } });
  });

  it('rejects more than three images', async () => {
    const image = (index: number) => ({ name: `product-${index}.png`, type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] });
    const response = await POST(requestWithFiles([image(1), image(2), image(3), image(4)]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'TOO_MANY_IMAGES' } });
  });

  it('rejects a multipart request whose declared size exceeds 50 MB before parsing files', async () => {
    const request = new NextRequest('http://localhost/api/v1/public/product-scan', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'user-agent': 'vitest-large-request',
        'content-type': 'multipart/form-data; boundary=test-boundary',
        'content-length': String(52 * 1024 * 1024),
      },
      body: '--test-boundary--',
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'FILES_TOO_LARGE' } });
  });
});
