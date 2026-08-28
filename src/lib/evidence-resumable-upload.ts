'use client';

import { Upload } from 'tus-js-client';
import { createClient } from '@/lib/supabase';

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export interface EvidenceUploadGrant {
  evidence_id: string;
  bucket: string;
  object_path: string;
  resumable_endpoint: string;
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

  const supabase = createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (sessionError || !session?.access_token || !publishableKey) {
    throw new Error('เซสชันอัปโหลดหมดอายุหรือการตั้งค่าระบบไม่พร้อม กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง');
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      callback();
    };

    // Ensure contentType is never empty — empty string causes Supabase 400
    const contentType = file.type || 'application/octet-stream';

    const upload = new Upload(file, {
      endpoint: grant.resumable_endpoint,
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      // Supabase Storage authorizes this direct TUS request with the active
      // browser session; Storage RLS additionally binds the path to the
      // server-created RESERVED evidence row.
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: publishableKey,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: grant.bucket,
        objectName: grant.object_path,
        contentType,
        cacheControl: 'no-cache',
      },
      uploadSize: file.size,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Each server-side reservation creates a fresh immutable object path.
      // A retry starts from that reservation rather than resuming an older one.
      storeFingerprintForResuming: false,
      onProgress: (bytesSent, bytesTotal) => {
        const percentage = bytesTotal > 0 ? Math.min(100, Math.round((bytesSent / bytesTotal) * 100)) : 0;
        onProgress?.(percentage, bytesSent, bytesTotal);
      },
      onSuccess: () => finish(resolve),
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        const is400 = /status:\s*400/i.test(message) || /Bad Request/i.test(message);
        const is403 = /status:\s*403/i.test(message) || /Forbidden/i.test(message);
        let userMessage = message;
        if (is400) userMessage = 'พื้นที่จัดเก็บปฏิเสธการอัปโหลด (400) กรุณาลองเลือกไฟล์ใหม่';
        else if (is403) userMessage = 'ไม่มีสิทธิ์อัปโหลดไปยังพื้นที่จัดเก็บ';
        finish(() => reject(new Error(userMessage)));
      },
    });

    const onAbort = () => {
      void upload.abort(false).finally(() => finish(() => reject(new DOMException('Upload cancelled', 'AbortError'))));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    // Always start fresh — never resume from previous uploads.
    upload.start();
  });
}
