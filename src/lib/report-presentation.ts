import type { PredictionFormReport } from './report-builder';

const SUPPORTED_PREDICTION_SCHEMAS = new Set([
  'lawirisk-prediction-form-v1',
  'lawirisk-prediction-form-v2',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function hasValidSections(value: unknown): boolean {
  return Array.isArray(value) && value.every((section) => isRecord(section)
    && typeof section.number === 'number'
    && isText(section.title)
    && isText(section.content));
}

function hasValidLegalAppendix(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && isText(item.law)
    && isText(item.penalty)
    && isText(item.settlement));
}

function hasValidAutomationSummary(value: unknown): boolean {
  return value === undefined || (isRecord(value)
    && ['AUTO_ADVICE_READY', 'DATA_REQUIRED'].includes(String(value.status))
    && isText(value.summary)
    && isText(value.officialGate));
}

function hasValidAutomatedAdvice(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => isRecord(item)
    && isText(item.id)
    && ['HIGH', 'MEDIUM', 'LOW'].includes(String(item.priority))
    && isText(item.category)
    && isText(item.title)
    && isText(item.recommendation)
    && isText(item.rationale)
    && typeof item.confidence === 'number'
    && typeof item.sourceCount === 'number'
    && typeof item.officialConfirmationRequired === 'boolean'));
}

export function parsePredictionFormContent(content: string): PredictionFormReport | null {
  try {
    const value: unknown = JSON.parse(content);
    if (!isRecord(value)
      || !SUPPORTED_PREDICTION_SCHEMAS.has(String(value.schemaVersion))
      || !isText(value.title)
      || !isText(value.caseNumber)
      || !isText(value.caseTitle)
      || !hasValidSections(value.sections)
      || !hasValidLegalAppendix(value.legalAppendix)
      || !isText(value.reviewNotice)
      || !hasValidAutomationSummary(value.automationSummary)
      || !hasValidAutomatedAdvice(value.automatedAdvice)) return null;
    return value as PredictionFormReport;
  } catch {
    return null;
  }
}

export function formatReportForClipboard(content: string): string {
  const report = parsePredictionFormContent(content);
  if (!report) return content;
  const sections = report.sections.map((section) => `${String(section.number).padStart(2, '0')} ${section.title}\n${section.content}`).join('\n\n');
  const legalAppendix = report.legalAppendix.length
    ? `\n\nภาคผนวกข้อกฎหมาย\n${report.legalAppendix.map((item, index) => `${index + 1}. ${item.law}\nโทษ: ${item.penalty}\nการดำเนินการ: ${item.settlement}`).join('\n\n')}`
    : '';
  return `${report.title}\nเลขคดี ${report.caseNumber} · ${report.caseTitle}\n\n${sections}${legalAppendix}\n\nหมายเหตุ\n${report.reviewNotice}`;
}
