import 'server-only';

type SupportedMime = 'application/pdf' | 'image/png' | 'image/jpeg';

export type StoredFileValidationResult =
  | { ok: true; detectedMime: SupportedMime; sizeBytes: number }
  | { ok: false; reason: string };

const signatures: Record<SupportedMime, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

function matchesSignature(bytes: Uint8Array, mime: SupportedMime) {
  return signatures[mime].every((value, index) => bytes[index] === value);
}

function totalSize(response: Response) {
  const contentRange = response.headers.get('content-range');
  const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
  if (rangeTotal) return Number(rangeTotal);
  return Number(response.headers.get('content-length') || '0');
}

export async function validateStoredFileReference(input: {
  sourceUrl: string;
  expectedSize: number;
  expectedMime: SupportedMime;
}): Promise<StoredFileValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(input.sourceUrl, {
      headers: { Range: 'bytes=0-7' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: 'STORED_OBJECT_UNAVAILABLE' };

    const sizeBytes = totalSize(response);
    const detectedMime = (response.headers.get('content-type') || '').split(';')[0].trim() as SupportedMime;
    if (sizeBytes !== input.expectedSize) {
      await response.body?.cancel();
      return { ok: false, reason: 'STORED_OBJECT_SIZE_MISMATCH' };
    }
    if (detectedMime !== input.expectedMime) {
      await response.body?.cancel();
      return { ok: false, reason: 'STORED_OBJECT_MIME_MISMATCH' };
    }

    const reader = response.body?.getReader();
    const firstChunk = reader ? await reader.read() : undefined;
    await reader?.cancel();
    const bytes = firstChunk?.value || new Uint8Array();
    if (!matchesSignature(bytes, input.expectedMime)) {
      return { ok: false, reason: 'STORED_OBJECT_SIGNATURE_MISMATCH' };
    }
    return { ok: true, detectedMime: input.expectedMime, sizeBytes };
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof Error && error.name === 'AbortError'
      ? 'STORED_OBJECT_VALIDATION_TIMEOUT'
      : 'STORED_OBJECT_VALIDATION_FAILED' };
  } finally {
    clearTimeout(timeout);
  }
}
