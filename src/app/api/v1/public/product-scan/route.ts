import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductImagesWithGemini, GeminiProductScanError } from '@/lib/providers/gemini-product-scan';
import { consumeRateLimit } from '@/lib/rate-limit';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { isSupabaseServiceConfigured } from '@/lib/runtime-config';
import { createServiceClient } from '@/lib/supabase-server';
import { lookupProductRegistration } from '@/lib/public-product-registry-lookup';

const MAX_IMAGE_COUNT = 3;
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;
const rules = {
  png: { mime: 'image/png' as const, magic: (bytes: Buffer) => bytes.subarray(0, 4).toString('hex') === '89504e47' },
  jpg: { mime: 'image/jpeg' as const, magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
  jpeg: { mime: 'image/jpeg' as const, magic: (bytes: Buffer) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' },
};

function response(body: unknown, status: number, requestId: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId, ...extraHeaders },
  });
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!hasTrustedBrowserOrigin(request)) {
    return response({ success: false, error: { code: 'UNTRUSTED_ORIGIN', message: 'คำขอไม่ได้มาจากหน้าบริการที่อนุญาต', request_id: requestId } }, 403, requestId);
  }

  try {
    const service = isSupabaseServiceConfigured() ? createServiceClient() : undefined;
    const clientAddress = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    const limit = await consumeRateLimit({
      client: service,
      key: `public-product-scan:${clientAddress}:${request.headers.get('user-agent') || 'unknown'}`,
      limit: 5,
      windowSeconds: 60,
    });
    if (!limit.allowed) {
      return response({ success: false, error: { code: 'RATE_LIMITED', message: 'สแกนภาพถี่เกินไป กรุณารอสักครู่', request_id: requestId } }, 429, requestId, { 'Retry-After': String(limit.retryAfterSeconds) });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_TOTAL_IMAGE_BYTES + 1024 * 1024) {
      return response({ success: false, error: { code: 'FILES_TOO_LARGE', message: 'ขนาดรวมของรูปภาพต้องไม่เกิน 50 MB', request_id: requestId } }, 413, requestId);
    }
    if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
      return response({ success: false, error: { code: 'INVALID_CONTENT_TYPE', message: 'กรุณาส่งรูปภาพแบบฟอร์มอัปโหลด', request_id: requestId } }, 415, requestId);
    }

    const formData = await request.formData();
    const selectedImages = formData.getAll('images').filter((entry): entry is File => entry instanceof File);
    const legacyImage = formData.get('image');
    const images = selectedImages.length > 0
      ? selectedImages
      : legacyImage instanceof File ? [legacyImage] : [];
    if (images.length === 0) {
      return response({ success: false, error: { code: 'IMAGE_REQUIRED', message: 'กรุณาเลือกรูปสินค้าที่ต้องการสแกน', request_id: requestId } }, 400, requestId);
    }
    if (images.length > MAX_IMAGE_COUNT) {
      return response({ success: false, error: { code: 'TOO_MANY_IMAGES', message: 'เลือกได้สูงสุด 3 ภาพต่อการสแกน', request_id: requestId } }, 400, requestId);
    }
    if (images.some((image) => image.size <= 0)) {
      return response({ success: false, error: { code: 'EMPTY_IMAGE', message: 'รูปภาพทุกไฟล์ต้องมีข้อมูล', request_id: requestId } }, 400, requestId);
    }
    if (images.reduce((total, image) => total + image.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
      return response({ success: false, error: { code: 'FILES_TOO_LARGE', message: 'ขนาดรวมของรูปภาพต้องไม่เกิน 50 MB', request_id: requestId } }, 413, requestId);
    }

    const validatedImages = [];
    for (const image of images) {
      const extension = image.name.split('.').pop()?.toLowerCase() as keyof typeof rules | undefined;
      const rule = extension ? rules[extension] : undefined;
      if (!rule || image.type !== rule.mime) {
        return response({ success: false, error: { code: 'UNSUPPORTED_IMAGE', message: 'รองรับเฉพาะภาพ PNG, JPG หรือ JPEG', request_id: requestId } }, 400, requestId);
      }
      const signature = Buffer.from(await image.slice(0, 4).arrayBuffer());
      if (!rule.magic(signature)) {
        return response({ success: false, error: { code: 'INVALID_IMAGE', message: 'โครงสร้างไฟล์ไม่ตรงกับชนิดรูปภาพ', request_id: requestId } }, 400, requestId);
      }
      validatedImages.push({ file: image, mimeType: rule.mime });
    }

    const analysis = await analyzeProductImagesWithGemini(validatedImages);
    const registryLookup = await lookupProductRegistration(analysis.result);
    return response({
      success: true,
      data: {
        requestId,
        ...analysis,
        imageCount: validatedImages.length,
        registryLookup,
        privacy: { stored: false, note: 'LAWiRISK ไม่บันทึกภาพเป็นหลักฐาน ระบบส่งภาพเป็นไฟล์ชั่วคราวให้ Gemini และสั่งลบทันทีหลังวิเคราะห์ โดยมีการลบอัตโนมัติภายใน 48 ชั่วโมงเป็นกรณีสำรอง' },
        disclaimer: 'ผลนี้เป็นการช่วยอ่านภาพเบื้องต้น ไม่ใช่คำรับรองความแท้ ความปลอดภัย การขึ้นทะเบียน หรือข้อสรุปทางกฎหมาย',
      },
    }, 200, requestId);
  } catch (error: unknown) {
    if (error instanceof GeminiProductScanError) {
      const status = error.code === 'RATE_LIMITED' ? 429 : error.code === 'INVALID_OUTPUT' ? 502 : 503;
      const message = error.code === 'RATE_LIMITED'
        ? 'บริการวิเคราะห์ภาพกำลังมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่ในอีกสักครู่'
        : 'ยังวิเคราะห์ภาพนี้ไม่ได้ในขณะนี้ กรุณาลองใหม่หรือค้นจากเลขทะเบียนด้วยตนเอง';
      return response({ success: false, error: { code: `SCAN_${error.code}`, message, request_id: requestId } }, status, requestId);
    }
    console.error(JSON.stringify({ event: 'PUBLIC_PRODUCT_SCAN_FAILED', requestId, message: error instanceof Error ? error.message : 'unknown' }));
    return response({ success: false, error: { code: 'SCAN_FAILED', message: 'เกิดข้อผิดพลาดระหว่างวิเคราะห์ภาพ กรุณาลองใหม่', request_id: requestId } }, 500, requestId);
  }
}
