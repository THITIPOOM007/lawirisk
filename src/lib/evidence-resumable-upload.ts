'use client';

import { Upload } from 'tus-js-client';

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export interface EvidenceUploadGrant {
  evidence_id: string;
  bucket: string;
  object_path: string;
  upload_token: string;
  resumable_endpoint: string;
  expires_in_seconds: number;
}
interface StartUploadOptions {
  file: File;
  grant: EvidenceUploadGrant;
  signal?: AbortSignal;
  onProgress?: (percentage: number, bytesSent: number, bytesTotal: number) => void;
}

export async function uploadEvidenceResumable(options: StartUploadOptions): Promise<void> {
  const { file, grant, signal, onProgress } = options;
  if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const upload = new Upload(file, {
      endpoint: grant.resumable_endpoint,
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: { 'x-signature': grant.upload_token },
      metadata: {
        bucketName: grant.bucket,
        objectName: grant.object_path,
        contentType: file.type,
        cacheControl: 'no-cache',
      },
      uploadSize: file.size,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      onProgress: (bytesSent, bytesTotal) => {
        const percentage = bytesTotal > 0 ? Math.min(100, Math.round((bytesSent / bytesTotal) * 100)) : 0;
        onProgress?.(percentage, bytesSent, bytesTotal);
      },
      onSuccess: () => finish(resolve),
      onError: (error) => finish(() => reject(error)),
    });

    const onAbort = () => {
      void upload.abort(false).finally(() => finish(() => reject(new DOMException('Upload cancelled', 'AbortError'))));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    void upload.findPreviousUploads()
      .then((previousUploads) => {
        if (signal?.aborted) return onAbort();
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch((error: unknown) => finish(() => reject(error)));
  });
}
