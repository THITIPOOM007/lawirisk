import 'server-only';

import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import type { PredictionFormReport } from '@/lib/report-builder';

const A4: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const SARABUN_BODY_SIZE = 16;
const SARABUN_TITLE_SIZE = 18;
const SARABUN_LINE_HEIGHT = 21;

function safeText(value: string, unicode: boolean) {
  return unicode ? value : value.replace(/[^\x20-\x7E\n\r\t]/g, '?');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, unicode: boolean) {
  const lines: string[] = [];
  for (const paragraph of safeText(text, unicode).replace(/\r/g, '').split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    const words = paragraph.includes(' ') ? paragraph.split(/\s+/) : Array.from(paragraph);
    let current = '';
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        if (current) { lines.push(current); current = ''; }
        let fragment = '';
        for (const character of Array.from(word)) {
          const candidateFragment = `${fragment}${character}`;
          if (fragment && font.widthOfTextAtSize(candidateFragment, size) > maxWidth) {
            lines.push(fragment);
            fragment = character;
          } else fragment = candidateFragment;
        }
        current = fragment;
        continue;
      }
      const candidate = paragraph.includes(' ') && current ? `${current} ${word}` : `${current}${word}`;
      if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawPageIdentity(page: PDFPage, font: PDFFont, caseNumber: string, snapshotHash: string, unicode: boolean) {
  const { width } = page.getSize();
  page.drawText(safeText(`LAWiRISK-SSK · ${caseNumber}`, unicode), { x: 38, y: 22, size: 11, font, color: rgb(0.35, 0.39, 0.48) });
  page.drawText(`SNAPSHOT ${snapshotHash.slice(0, 24).toUpperCase()}...`, { x: width - 225, y: 22, size: 10, font, color: rgb(0.35, 0.39, 0.48) });
}

function drawPageNumbers(pdfDoc: PDFDocument, font: PDFFont, unicode: boolean) {
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const label = safeText(`หน้า ${index + 1} / ${pages.length}`, unicode);
    page.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, 11) / 2, y: 22, size: 11, font, color: rgb(0.35, 0.39, 0.48) });
  });
}

function drawFormHeader(page: PDFPage, font: PDFFont, bold: PDFFont, report: PredictionFormReport, unicode: boolean) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: rgb(0.035, 0.08, 0.14) });
  page.drawRectangle({ x: 0, y: height - 96, width, height: 4, color: rgb(0.08, 0.75, 0.72) });
  page.drawText('LAWIRISK-SSK / EVIDENCE INTELLIGENCE', { x: 38, y: height - 27, size: 11, font: bold, color: rgb(0.30, 0.92, 0.86) });
  page.drawText(safeText(report.title, unicode), { x: 38, y: height - 52, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safeText(`เลขคดี ${report.caseNumber} · ${report.caseTitle}`, unicode), { x: 38, y: height - 76, size: 14, font, color: rgb(0.76, 0.82, 0.9) });
}

export function parsePredictionFormReport(content: string): PredictionFormReport | null {
  try {
    const value = JSON.parse(content) as Partial<PredictionFormReport>;
    if (!['lawirisk-prediction-form-v1', 'lawirisk-prediction-form-v2'].includes(value.schemaVersion || '') || !Array.isArray(value.sections) || typeof value.caseNumber !== 'string') return null;
    return value as PredictionFormReport;
  } catch {
    return null;
  }
}

export function renderPredictionFormPdf(input: {
  pdfDoc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  report: PredictionFormReport;
  snapshotHash: string;
  unicode: boolean;
}) {
  const { pdfDoc, font, bold, report, snapshotHash, unicode } = input;
  let page = pdfDoc.addPage(A4);
  drawFormHeader(page, font, bold, report, unicode);
  let y = A4[1] - 118;
  const left = 38;
  const boxWidth = A4[0] - 76;
  const numberWidth = 38;
  const contentWidth = boxWidth - numberWidth - 24;
  const lineHeight = SARABUN_LINE_HEIGHT;

  if (report.dataQuality) {
    const label = report.dataQuality.status === 'COMPLETE' ? 'ข้อมูลครบตามหัวข้อหลัก' : `ข้อมูลยังขาด ${report.dataQuality.missingFields.length} หัวข้อ`;
    page.drawRectangle({ x: left, y: y - 54, width: boxWidth, height: 54, borderColor: rgb(0.08, 0.75, 0.72), borderWidth: 0.8, color: rgb(0.92, 0.98, 0.97) });
    page.drawText(safeText(`ความครบถ้วน ${report.dataQuality.score}% · ${label}`, unicode), { x: left + 12, y: y - 23, size: 18, font: bold, color: rgb(0.04, 0.35, 0.34) });
    page.drawText(safeText(`แหล่งข้อมูลในรายงาน ${report.dataQuality.sourceCount} รายการ`, unicode), { x: left + 12, y: y - 43, size: 14, font, color: rgb(0.25, 0.35, 0.39) });
    y -= 66;
  }

  const newPage = () => {
    drawPageIdentity(page, font, report.caseNumber, snapshotHash, unicode);
    page = pdfDoc.addPage(A4);
    drawFormHeader(page, font, bold, report, unicode);
    y = A4[1] - 118;
  };

  for (const section of report.sections) {
    const titleLines = wrapText(section.title, bold, SARABUN_TITLE_SIZE, contentWidth, unicode);
    const contentLines = wrapText(section.content, font, SARABUN_BODY_SIZE, contentWidth, unicode);
    const remaining = [...contentLines];
    let continuation = false;
    do {
      const availableLines = Math.max(1, Math.floor((y - 64 - 38) / lineHeight) - titleLines.length - 1);
      if (availableLines < 2) { newPage(); continue; }
      const chunk = remaining.splice(0, availableLines);
      const height = Math.max(78, 22 + titleLines.length * lineHeight + chunk.length * lineHeight);
      if (y - height < 42) { newPage(); remaining.unshift(...chunk); continue; }
      page.drawRectangle({ x: left, y: y - height, width: boxWidth, height, borderColor: rgb(0.69, 0.74, 0.82), borderWidth: 0.8, color: rgb(0.98, 0.985, 0.995) });
      page.drawRectangle({ x: left, y: y - height, width: numberWidth, height, color: rgb(0.04, 0.16, 0.22) });
      page.drawText(String(section.number).padStart(2, '0'), { x: left + 9, y: y - 29, size: 16, font: bold, color: rgb(0.30, 0.92, 0.86) });
      let textY = y - 23;
      for (const line of titleLines) {
        page.drawText(line, { x: left + numberWidth + 12, y: textY, size: SARABUN_TITLE_SIZE, font: bold, color: rgb(0.05, 0.09, 0.16) });
        textY -= lineHeight;
      }
      if (continuation) {
        page.drawText(safeText('(ต่อ)', unicode), { x: left + numberWidth + 12, y: textY, size: 14, font: bold, color: rgb(0.35, 0.42, 0.52) });
        textY -= lineHeight;
      }
      for (const line of chunk) {
        page.drawText(line || ' ', { x: left + numberWidth + 12, y: textY, size: SARABUN_BODY_SIZE, font, color: rgb(0.12, 0.16, 0.23) });
        textY -= lineHeight;
      }
      y -= height + 10;
      continuation = true;
      if (remaining.length) newPage();
    } while (remaining.length);
  }

  const noticeLines = wrapText(report.reviewNotice, font, SARABUN_BODY_SIZE, boxWidth - 20, unicode);
  const noticeHeight = noticeLines.length * SARABUN_LINE_HEIGHT + 24;
  if (y - noticeHeight < 42) newPage();
  page.drawRectangle({ x: left, y: y - noticeHeight, width: boxWidth, height: noticeHeight, borderColor: rgb(0.93, 0.61, 0.18), borderWidth: 0.7, color: rgb(1, 0.97, 0.88) });
  let noticeY = y - 21;
  for (const line of noticeLines) { page.drawText(line, { x: left + 10, y: noticeY, size: SARABUN_BODY_SIZE, font, color: rgb(0.42, 0.25, 0.05) }); noticeY -= SARABUN_LINE_HEIGHT; }
  drawPageIdentity(page, font, report.caseNumber, snapshotHash, unicode);

  const sourceRows: Array<[string, string, string]> = [];
  if (report.sourceSummary) {
    sourceRows.push(['สถานะคดี', report.sourceSummary.caseStatus, 'Snapshot ของรายงานฉบับนี้']);
    for (const item of report.sourceSummary.intake || []) sourceRows.push(['ข้อมูลรับเรื่อง', `${item.label}: ${item.value}`, item.source]);
    for (const item of report.sourceSummary.officialChecks || []) sourceRows.push(['ผลตรวจฐานทางการ', `${item.source}\nคำค้น: ${item.query}\n${item.summary}`, `${item.status}\nตรวจเมื่อ ${item.checkedAt}\n${item.sourceUrl || ''}`]);
    for (const item of report.sourceSummary.evidence) sourceRows.push(['หลักฐาน', item.filename, `SHA-256 ${item.sha256}\nสถานะ ${item.status}`]);
    for (const item of report.sourceSummary.entities) sourceRows.push(['ข้อมูลที่มี source trace', `${item.type}: ${item.value}`, 'อ้างอิงจาก entity mention ที่อยู่ในขอบเขตรายงาน']);
    for (const item of report.sourceSummary.relationships) sourceRows.push(['ความสัมพันธ์ที่รับรอง', item.type, 'มี relationship reference ในขอบเขตรายงาน']);
    for (const item of report.sourceSummary.screenings) sourceRows.push(['ผลสกรีนนิ่ง', `${item.filename}\n${item.summary}`, `${item.classification} / ${item.status}`]);
  }
  if (sourceRows.length === 0) sourceRows.push(['ข้อมูลใน snapshot', 'รายงานเดิมไม่มีตาราง source summary', 'สร้างรายงานฉบับใหม่เพื่อรวมข้อมูลจริงและ source trace แบบตาราง']);

  const tableWidths = [130, 365, 275];
  const tableHeaders = ['ประเภทข้อมูล', 'ข้อมูลจริงในสำนวน', 'แหล่งอ้างอิง / สถานะ'];
  let sourcePage!: PDFPage;
  let sourceRowY = 0;
  const startSourcePage = () => {
    sourcePage = pdfDoc.addPage(A4_LANDSCAPE);
    const { width, height } = sourcePage.getSize();
    sourcePage.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: rgb(0.035, 0.08, 0.14) });
    sourcePage.drawText(safeText('ตารางข้อมูลจริงจากหลักฐานและ Source Trace', unicode), { x: 36, y: height - 42, size: 20, font: bold, color: rgb(1, 1, 1) });
    sourceRowY = height - 92;
    let headerX = 36;
    for (let index = 0; index < tableHeaders.length; index += 1) {
      sourcePage.drawRectangle({ x: headerX, y: sourceRowY - 34, width: tableWidths[index], height: 34, color: rgb(0.04, 0.16, 0.22), borderColor: rgb(0.35, 0.46, 0.57), borderWidth: 0.7 });
      sourcePage.drawText(safeText(tableHeaders[index], unicode), { x: headerX + 8, y: sourceRowY - 24, size: 16, font: bold, color: rgb(0.30, 0.92, 0.86) });
      headerX += tableWidths[index];
    }
    sourceRowY -= 34;
  };
  startSourcePage();
  for (const row of sourceRows) {
    const wrapped = row.map((value, index) => wrapText(value.slice(0, 1200), font, SARABUN_BODY_SIZE, tableWidths[index] - 16, unicode));
    const rowHeight = Math.max(50, Math.max(...wrapped.map((lines) => lines.length)) * SARABUN_LINE_HEIGHT + 16);
    if (sourceRowY - rowHeight < 42) {
      drawPageIdentity(sourcePage!, font, report.caseNumber, snapshotHash, unicode);
      startSourcePage();
    }
    let rowX = 36;
    for (let index = 0; index < row.length; index += 1) {
      sourcePage!.drawRectangle({ x: rowX, y: sourceRowY - rowHeight, width: tableWidths[index], height: rowHeight, borderColor: rgb(0.64, 0.69, 0.76), borderWidth: 0.6, color: index === 0 ? rgb(0.94, 0.97, 0.98) : rgb(0.985, 0.99, 1) });
      let lineY = sourceRowY - 21;
      for (const line of wrapped[index]) { sourcePage!.drawText(line || ' ', { x: rowX + 8, y: lineY, size: SARABUN_BODY_SIZE, font: index === 0 ? bold : font, color: rgb(0.12, 0.16, 0.23) }); lineY -= SARABUN_LINE_HEIGHT; }
      rowX += tableWidths[index];
    }
    sourceRowY -= rowHeight;
  }
  drawPageIdentity(sourcePage!, font, report.caseNumber, snapshotHash, unicode);

  const tableX = 36;
  const widths = [310, 240, 220];
  const headers = ['ข้อกฎหมาย', 'โทษ', 'กรณีเปรียบเทียบปรับ/การดำเนินการ'];
  const rows = report.legalAppendix.length ? report.legalAppendix : [{ law: 'ระบบยังไม่พบข้อกฎหมายที่มีแหล่งทางการพร้อมอ้างอิง', penalty: 'ยังไม่มีข้อมูล', settlement: 'ยังไม่มีข้อมูล' }];
  let legalPage!: PDFPage;
  let rowY = 0;
  const startLegalPage = () => {
    legalPage = pdfDoc.addPage(A4_LANDSCAPE);
    const { width, height } = legalPage.getSize();
    legalPage.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: rgb(0.035, 0.08, 0.14) });
    legalPage.drawText(safeText('ภาคผนวกหัวข้อกฎหมายสำหรับสืบค้นและรับรอง', unicode), { x: 36, y: height - 42, size: 20, font: bold, color: rgb(1, 1, 1) });
    rowY = height - 110;
    let headerX = tableX;
    for (let index = 0; index < headers.length; index += 1) {
      legalPage.drawRectangle({ x: headerX, y: rowY - 34, width: widths[index], height: 34, color: rgb(0.04, 0.16, 0.22), borderColor: rgb(0.35, 0.46, 0.57), borderWidth: 0.7 });
      legalPage.drawText(safeText(headers[index], unicode), { x: headerX + 8, y: rowY - 24, size: 16, font: bold, color: rgb(0.30, 0.92, 0.86) });
      headerX += widths[index];
    }
    rowY -= 34;
  };
  startLegalPage();
  for (const row of rows) {
    const values = [row.law, row.penalty, row.settlement];
    const wrapped = values.map((value, index) => wrapText(value, font, SARABUN_BODY_SIZE, widths[index] - 16, unicode));
    const rowHeight = Math.max(52, Math.max(...wrapped.map((lines) => lines.length)) * SARABUN_LINE_HEIGHT + 16);
    if (rowY - rowHeight < 42) { drawPageIdentity(legalPage, font, report.caseNumber, snapshotHash, unicode); startLegalPage(); }
    let x = tableX;
    for (let index = 0; index < values.length; index += 1) {
      legalPage.drawRectangle({ x, y: rowY - rowHeight, width: widths[index], height: rowHeight, borderColor: rgb(0.64, 0.69, 0.76), borderWidth: 0.6, color: rgb(0.985, 0.99, 1) });
      let lineY = rowY - 21;
      for (const line of wrapped[index]) { legalPage.drawText(line, { x: x + 8, y: lineY, size: SARABUN_BODY_SIZE, font, color: rgb(0.12, 0.16, 0.23) }); lineY -= SARABUN_LINE_HEIGHT; }
      x += widths[index];
    }
    rowY -= rowHeight;
  }
  drawPageIdentity(legalPage, font, report.caseNumber, snapshotHash, unicode);
  drawPageNumbers(pdfDoc, font, unicode);
}

export function renderGenericReportPdf(input: {
  pdfDoc: PDFDocument; font: PDFFont; bold: PDFFont; title: string; caseNumber: string;
  reportType: string; content: string; snapshotHash: string; unicode: boolean;
}) {
  const { pdfDoc, font, bold, title, caseNumber, reportType, content, snapshotHash, unicode } = input;
  let page = pdfDoc.addPage(A4);
  let y = A4[1] - 112;
  const left = 38;
  const width = A4[0] - 76;
  const header = () => {
    const { height, width: pageWidth } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 92, width: pageWidth, height: 92, color: rgb(0.035, 0.08, 0.14) });
    page.drawRectangle({ x: 0, y: height - 96, width: pageWidth, height: 4, color: rgb(0.08, 0.75, 0.72) });
    page.drawText('LAWIRISK-SSK / IMMUTABLE REPORT SNAPSHOT', { x: left, y: height - 25, size: 11, font: bold, color: rgb(0.30, 0.92, 0.86) });
    const titleLine = wrapText(title, bold, 20, width, unicode)[0] || title;
    page.drawText(titleLine, { x: left, y: height - 51, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText(safeText(`${caseNumber} · ${reportType}`, unicode), { x: left, y: height - 75, size: 14, font, color: rgb(0.76, 0.82, 0.9) });
    y = height - 116;
  };
  const newPage = () => { drawPageIdentity(page, font, caseNumber, snapshotHash, unicode); page = pdfDoc.addPage(A4); header(); };
  const ensure = (height: number) => { if (y - height < 42) newPage(); };
  header();
  const sectionHeadings = new Set(['ข้อมูลคดี', 'ข้อมูลรับเรื่อง', 'ผลตรวจฐานข้อมูลทางการ (SUGGESTED)', 'หลักฐานต้นฉบับใน snapshot', 'ข้อมูลที่มี source trace', 'ความสัมพันธ์ที่รับรองและมีแหล่งอ้างอิง', 'ขอบเขต']);
  for (const rawLine of content.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line === title) { y -= 5; continue; }
    if (sectionHeadings.has(line)) {
      ensure(38);
      page.drawRectangle({ x: left, y: y - 30, width, height: 30, color: rgb(0.04, 0.16, 0.22), borderColor: rgb(0.18, 0.55, 0.56), borderWidth: 0.6 });
      page.drawText(safeText(line, unicode), { x: left + 10, y: y - 22, size: 17, font: bold, color: rgb(0.30, 0.92, 0.86) });
      y -= 36;
      continue;
    }
    const colonIndex = line.indexOf(':');
    if (!line.startsWith('-') && colonIndex > 0 && colonIndex < 40) {
      const label = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim() || '-';
      const labelWidth = 145;
      const valueLines = wrapText(value, font, SARABUN_BODY_SIZE, width - labelWidth - 20, unicode);
      const rowHeight = Math.max(42, valueLines.length * SARABUN_LINE_HEIGHT + 16);
      ensure(rowHeight + 2);
      page.drawRectangle({ x: left, y: y - rowHeight, width: labelWidth, height: rowHeight, color: rgb(0.94, 0.97, 0.98), borderColor: rgb(0.69, 0.74, 0.82), borderWidth: 0.6 });
      page.drawRectangle({ x: left + labelWidth, y: y - rowHeight, width: width - labelWidth, height: rowHeight, color: rgb(0.985, 0.99, 1), borderColor: rgb(0.69, 0.74, 0.82), borderWidth: 0.6 });
      page.drawText(safeText(label, unicode), { x: left + 8, y: y - 25, size: SARABUN_BODY_SIZE, font: bold, color: rgb(0.08, 0.18, 0.24) });
      let lineY = y - 25;
      for (const valueLine of valueLines) { page.drawText(valueLine, { x: left + labelWidth + 10, y: lineY, size: SARABUN_BODY_SIZE, font, color: rgb(0.12, 0.16, 0.23) }); lineY -= SARABUN_LINE_HEIGHT; }
      y -= rowHeight;
      continue;
    }
    const lines = wrapText(line, font, SARABUN_BODY_SIZE, width - 20, unicode);
    const rowHeight = Math.max(38, lines.length * SARABUN_LINE_HEIGHT + 14);
    ensure(rowHeight + 2);
    page.drawRectangle({ x: left, y: y - rowHeight, width, height: rowHeight, color: rgb(0.985, 0.99, 1), borderColor: rgb(0.75, 0.79, 0.85), borderWidth: 0.5 });
    let lineY = y - 23;
    for (const wrapped of lines) { page.drawText(wrapped || ' ', { x: left + 10, y: lineY, size: SARABUN_BODY_SIZE, font, color: rgb(0.12, 0.16, 0.23) }); lineY -= SARABUN_LINE_HEIGHT; }
    y -= rowHeight;
  }
  drawPageIdentity(page, font, caseNumber, snapshotHash, unicode);
  drawPageNumbers(pdfDoc, font, unicode);
}
