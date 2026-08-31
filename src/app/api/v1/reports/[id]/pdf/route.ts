import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { parsePredictionFormReport, renderGenericReportPdf, renderPredictionFormPdf } from '@/lib/report-pdf';
import { createServer } from '@/lib/supabase-server';
import { isDemoServerEnabled } from '@/lib/runtime-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const traceId = requestId();
  const { id: reportId } = await params;

  try {
    const auth = await authorizeStaff(request, STAFF_READ_ROLES);
    if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์เข้าถึงรายงาน');

    let reportTitle = `รายงานเลขที่ ${reportId}`;
    let caseNumber = '-';
    let reportType = 'SUMMARY';
    let contentText = '';
    let snapshotHash = '';

    if (auth.identity.mode === 'demo' || isDemoServerEnabled()) {
      reportTitle = `รายงานสรุปคดีสาธิต #${reportId}`;
      caseNumber = 'ค.123/2569';
      reportType = 'SUMMARY';
      contentText = 'รายงานสรุปข้อมูลคดีจากแหล่งอ้างอิงที่ยืนยันแล้ว (ข้อมูลสังเคราะห์)\n- หลักฐาน fb_ad_screenshot.png | SHA-256 89504E47... | ตรวจรูปแบบแล้ว\n- PERSON: บุคคลตัวอย่าง จ\n- PHONE: 080-000-0000';
      snapshotHash = crypto.createHash('sha256').update(contentText).digest('hex');
    } else {
      const supabase = await createServer();
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('id, case_id, title, report_type, content, source_snapshot, snapshot_sha256, created_at')
        .eq('id', reportId)
        .maybeSingle();

      if (reportError || !reportData) {
        return apiError('NOT_FOUND', 'ไม่พบรายงานที่ระบุ', 404, traceId);
      }

      const { data: caseData } = await supabase
        .from('cases')
        .select('id, number, title')
        .eq('id', reportData.case_id)
        .maybeSingle();

      reportTitle = reportData.title || `รายงานเลขที่ ${reportId}`;
      caseNumber = caseData?.number || '-';
      reportType = reportData.report_type || 'SUMMARY';
      contentText = typeof reportData.content === 'string' ? reportData.content : JSON.stringify(reportData.content, null, 2);
      snapshotHash = reportData.snapshot_sha256 || crypto.createHash('sha256').update(contentText).digest('hex');
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    let font: PDFFont | undefined;
    let fontBold: PDFFont | undefined;
    try {
      const loadFont = async (assetPath: string) => {
        const fontUrl = new URL(assetPath, request.url);
        let response: Response | undefined;
        try {
          // Keep this runtime-only import out of Next's local webpack graph.
          // Cloudflare provides the module at runtime; Node falls through to HTTP.
          const { env } = await import(/* webpackIgnore: true */ 'cloudflare:workers');
          const assets = env.ASSETS as { fetch(input: Request): Promise<Response> } | undefined;
          if (assets?.fetch) response = await assets.fetch(new Request(fontUrl));
        } catch {
          // Node and local Next.js do not expose the Cloudflare ASSETS binding.
        }
        response ||= await fetch(fontUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`font asset ${assetPath} returned HTTP ${response.status}`);
        }
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength < 1024) {
          throw new Error(`font asset ${assetPath} is incomplete`);
        }
        return pdfDoc.embedFont(bytes, { subset: true });
      };
      [font, fontBold] = await Promise.all([
        loadFont('/fonts/THSarabunNew-Regular.ttf'),
        loadFont('/fonts/THSarabunNew-Bold.ttf'),
      ]);
    } catch (error: unknown) {
      console.error('TH Sarabun New PDF font unavailable', error);
      return apiError(
        'PDF_FONT_UNAVAILABLE',
        'ไม่สามารถโหลดฟอนต์ TH Sarabun New สำหรับภาษาไทยได้ ระบบหยุดสร้างไฟล์เพื่อป้องกันเอกสารที่อ่านไม่ออก กรุณากดลองใหม่',
        503,
        traceId,
      );
    }

    if (!font || !fontBold) {
      return apiError(
        'PDF_FONT_UNAVAILABLE',
        'ฟอนต์ TH Sarabun New สำหรับภาษาไทยไม่พร้อมใช้งาน',
        503,
        traceId,
      );
    }

    pdfDoc.setTitle(reportTitle);
    pdfDoc.setAuthor('LAWiRISK-SSK');
    pdfDoc.setCreationDate(new Date());

    const predictionForm = reportType === 'PREDICTION_FORM' ? parsePredictionFormReport(contentText) : null;
    if (predictionForm) {
      renderPredictionFormPdf({ pdfDoc, font, bold: fontBold, report: predictionForm, snapshotHash, unicode: true });
    } else {
      renderGenericReportPdf({ pdfDoc, font, bold: fontBold, title: reportTitle, caseNumber, reportType, content: contentText, snapshotHash, unicode: true });
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="report-${reportId}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Request-ID': traceId,
      },
    });
  } catch (error: unknown) {
    console.error('PDF generation error:', error);
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดในการสร้างไฟล์ PDF', 500, traceId);
  }
}
