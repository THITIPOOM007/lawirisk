import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateStoredFileReference } from './stored-file-validator';

vi.mock('server-only', () => ({}));

afterEach(() => vi.unstubAllGlobals());

describe('validateStoredFileReference', () => {
  it('accepts matching size, MIME and magic bytes without downloading the full file', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
      status: 206,
      headers: {
        'content-range': 'bytes 0-4/209715200',
        'content-type': 'application/pdf',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateStoredFileReference({
      sourceUrl: 'https://storage.example.test/signed',
      expectedSize: 209715200,
      expectedMime: 'application/pdf',
    })).resolves.toEqual({ ok: true, detectedMime: 'application/pdf', sizeBytes: 209715200 });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { Range: 'bytes=0-7' } }));
  });

  it('rejects a signature mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      status: 206,
      headers: { 'content-range': 'bytes 0-3/4', 'content-type': 'application/pdf' },
    })));

    await expect(validateStoredFileReference({
      sourceUrl: 'https://storage.example.test/signed',
      expectedSize: 4,
      expectedMime: 'application/pdf',
    })).resolves.toEqual({ ok: false, reason: 'STORED_OBJECT_SIGNATURE_MISMATCH' });
  });
});
