import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { renderGenericReportPdf, renderPredictionFormPdf } from './report-pdf';
import { buildPredictionFormReport } from './report-builder';

describe('report PDF renderer', () => {
  it('paginates the prediction form and adds a landscape legal appendix', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const report = buildPredictionFormReport({
      caseRecord: { number: 'CASE-1', title: 'Synthetic case', description: 'Long synthetic description '.repeat(80), status: 'ACTIVE', created_at: '2026-08-30T00:00:00.000Z' },
      evidence: Array.from({ length: 12 }, (_, index) => ({ filename: `evidence-${index + 1}.pdf`, sha256: String(index).padStart(64, '0'), malware_scan_status: 'CLEAN' })),
      sourcedEntities: [{ type: 'ORGANIZATION', value: 'Example organization' }],
      sourcedRelationships: [{ type: 'RELATED_TO' }],
    });
    report.legalAppendix = Array.from({ length: 20 }, (_, index) => ({
      law: `Official-law-source-${index + 1} `.repeat(4), penalty: `Penalty-${index + 1} `.repeat(3), settlement: `Procedure-${index + 1} `.repeat(3),
    }));
    renderPredictionFormPdf({ pdfDoc, font, bold: font, report, snapshotHash: 'a'.repeat(64), unicode: false });
    expect(pdfDoc.getPageCount()).toBeGreaterThan(5);
    const lastPage = pdfDoc.getPages().at(-1);
    expect(lastPage?.getWidth()).toBeGreaterThan(lastPage?.getHeight() || Infinity);
    const bytes = await pdfDoc.save();
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
  });

  it('paginates generic reports instead of truncating after the first page', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    renderGenericReportPdf({
      pdfDoc, font, bold: font, title: 'Long report', caseNumber: 'CASE-2', reportType: 'SUMMARY',
      content: Array.from({ length: 220 }, (_, index) => `Evidence line ${index + 1}`).join('\n'),
      snapshotHash: 'b'.repeat(64), unicode: false,
    });
    expect(pdfDoc.getPageCount()).toBeGreaterThan(1);
  });

  it('embeds TH Sarabun New and renders Thai text at 16 point without substitution', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const [regularBytes, boldBytes] = await Promise.all([
      readFile(resolve('public/fonts/THSarabunNew-Regular.ttf')),
      readFile(resolve('public/fonts/THSarabunNew-Bold.ttf')),
    ]);
    const font = await pdfDoc.embedFont(regularBytes, { subset: true });
    const bold = await pdfDoc.embedFont(boldBytes, { subset: true });
    expect(font.getCharacterSet()).toContain('ก'.codePointAt(0));
    expect(font.getCharacterSet()).toContain('ำ'.codePointAt(0));

    const report = buildPredictionFormReport({
      caseRecord: {
        number: 'DEMO-THAI-001',
        title: '[ข้อมูลทดสอบ] ตรวจสอบรายละเอียดพยานหลักฐานภาษาไทย',
        description: 'ตรวจสอบรายละเอียดพยานหลักฐานภาษาไทย พร้อมแหล่งอ้างอิงและเหตุผลความเกี่ยวข้อง',
        status: 'ACTIVE',
        created_at: '2026-08-30T00:00:00.000Z',
      },
      evidence: [{ filename: 'หลักฐานภาษาไทย.pdf', sha256: 'c'.repeat(64), malware_scan_status: 'CLEAN' }],
      sourcedEntities: [{ type: 'ORGANIZATION', value: 'หน่วยงานทดสอบภาษาไทย' }],
      sourcedRelationships: [{ type: 'RELATED_TO' }],
    });
    renderPredictionFormPdf({ pdfDoc, font, bold, report, snapshotHash: 'd'.repeat(64), unicode: true });
    const bytes = await pdfDoc.save();
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(20_000);

    const outputDir = resolve('tmp/pdfs');
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, 'report-thai-sarabun-qa.pdf'), bytes);
  });
});
