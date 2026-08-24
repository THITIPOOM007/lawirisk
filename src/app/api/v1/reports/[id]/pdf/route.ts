import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
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
      contentText = 'รายงานสรุปข้อมูลคดีจากแหล่งอ้างอิงที่ยืนยันแล้ว (โหมดสาธิต)\n- หลักฐาน fb_ad_screenshot.png | SHA-256 89504E47... | ตรวจรูปแบบแล้ว\n- PERSON: นางสาวปนัดดา คำนนท์\n- PHONE: 062-4149791';
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
    let font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    let fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let hasUnicodeFont = false;
    
    // Attempt to load Thai font
    try {
      // Must dynamically import to avoid breaking edge if fontkit not available
      const fontkit = await import('@pdf-lib/fontkit');
      pdfDoc.registerFontkit(fontkit.default || fontkit);
      const fontUrl = new URL('/Thasadith-Regular.ttf', request.url);
      let fontRes = await fetch(fontUrl, { cache: 'force-cache' });
      if (!fontRes.ok) fontRes = await fetch(fontUrl, { cache: 'no-store' });
      if (fontRes.ok) {
        const fontBytes = await fontRes.arrayBuffer();
        font = await pdfDoc.embedFont(fontBytes);
        fontBold = font; // Use same font if bold is not available
        hasUnicodeFont = true;
      } else {
        console.warn('Thai PDF font asset unavailable', { status: fontRes.status });
      }
    } catch (err) {
      console.warn('Failed to load Thai font, falling back to Helvetica', err);
    }

    pdfDoc.setTitle(reportTitle);
    pdfDoc.setAuthor('LAWiRISK-SSK');
    pdfDoc.setCreationDate(new Date());

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { height } = page.getSize();
    let y = height - 50;

    const drawLine = (text: string, isBold = false, size = 10, color = rgb(0.1, 0.1, 0.1)) => {
      // Standard PDF fonts are WinAnsi-only. Keep report generation available
      // if the public font asset is temporarily unreachable, while preserving
      // the immutable snapshot hash above for exact source verification.
      const printableText = hasUnicodeFont ? text : text.replace(/[^\x20-\x7E]/g, '?');
      page.drawText(printableText, {
        x: 50,
        y,
        size,
        font: isBold ? fontBold : font,
        color,
      });
      y -= size + 6;
    };

    // Header
    drawLine('LAWIRISK-SSK | DIGITAL EVIDENCE COMMAND LEDGER', true, 14, rgb(0.15, 0.2, 0.5));
    drawLine(`REPORT: ${reportTitle}`, true, 12);
    drawLine(`CASE NUMBER: ${caseNumber}  |  TYPE: ${reportType}  |  DATE: ${new Date().toISOString().slice(0, 10)}`, false, 9, rgb(0.4, 0.4, 0.4));
    drawLine(`SNAPSHOT SHA-256: ${snapshotHash}`, false, 8, rgb(0.4, 0.4, 0.4));
    y -= 10;

    drawLine('--- IMMUTABLE REPORT CONTENT SNAPSHOT ---', true, 9, rgb(0.2, 0.2, 0.2));
    const lines = contentText.split('\n');
    for (const line of lines) {
      if (y < 60) break;
      drawLine(line.substring(0, 95), false, 9);
    }

    y = 40;
    drawLine('DISCLAIMER: Official immutable record generated by LAWiRISK-SSK. For law enforcement operational use only.', false, 7, rgb(0.5, 0.5, 0.5));

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
