'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCopy, Download, ExternalLink, FileText, Loader2, SearchCheck, ShieldAlert, X } from 'lucide-react';
import type { CaseReconSummary, DossierDocument, ReconDimensionStatus } from '@/lib/case-intelligence';

const statusStyle: Record<ReconDimensionStatus, string> = {
  AVAILABLE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  LOCAL_AUTO_LOGIN: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  REVIEW_REQUIRED: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  RISK_ACK_REQUIRED: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

const statusLabel: Record<ReconDimensionStatus, string> = {
  AVAILABLE: 'พร้อมใช้งาน',
  LOCAL_AUTO_LOGIN: 'ล็อกอินอัตโนมัติ',
  REVIEW_REQUIRED: 'ต้องตรวจ/ยืนยัน',
  RISK_ACK_REQUIRED: 'ต้องยืนยันความเสี่ยง',
};

export function CaseIntelligenceWorkspace({ caseId }: { caseId: string }) {
  const [report, setReport] = useState<CaseReconSummary | null>(null);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DossierDocument | null>(null);
  const [loading, setLoading] = useState<'recon' | 'dossier' | ''>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function post<T>(path: string): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ case_id: caseId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || 'ระบบประมวลผลคำขอไม่สำเร็จ');
    return body.data as T;
  }

  async function runRecon() {
    setLoading('recon');
    setError('');
    try {
      const data = await post<{ report: CaseReconSummary }>('/api/v1/intelligence/recon');
      setReport(data.report);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'เปิด workspace ไม่สำเร็จ');
    } finally {
      setLoading('');
    }
  }

  async function createDossier() {
    setLoading('dossier');
    setError('');
    try {
      const data = await post<{ documents: DossierDocument[] }>('/api/v1/intelligence/dossier');
      setDocuments(data.documents);
      setSelectedDocument(data.documents[0] || null);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'สร้างร่างแฟ้มไม่สำเร็จ');
    } finally {
      setLoading('');
    }
  }

  async function copyDocument() {
    if (!selectedDocument) return;
    await navigator.clipboard.writeText(selectedDocument.plainText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function downloadDocument() {
    if (!selectedDocument) return;
    const url = URL.createObjectURL(new Blob([selectedDocument.plainText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedDocument.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-3xl border border-indigo-500/25 bg-slate-900/40 p-6 sm:p-7 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-300">
            <SearchCheck className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">Case Intelligence Workspace</h2>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
            ครอบคลุม 10 มิติ: ทะเบียนราชการ ชื่อ/เบอร์โทร ภาพถ่าย สถานที่ พยานแวดล้อม ความเชื่อมโยง และกฎหมาย พร้อม Recon Companion สำหรับล็อกอินระบบที่อนุญาตบนเครื่องเจ้าหน้าที่ โดยไม่ส่งรหัสผ่านขึ้น Cloudflare/Supabase
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={runRecon} disabled={Boolean(loading)} className="inline-flex items-center rounded-xl bg-teal-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-teal-200 disabled:opacity-50">
            {loading === 'recon' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
            ตรวจสถานะข้อมูลคดี
          </button>
          <button type="button" onClick={createDossier} disabled={Boolean(loading)} className="inline-flex items-center rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50">
            {loading === 'dossier' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            สร้างร่างแฟ้ม
          </button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300"><ShieldAlert className="h-4 w-4" />{error}</div>}

      {!report && !error && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 p-6 text-center text-xs text-slate-500">
          กด “ตรวจสถานะข้อมูลคดี” เพื่อดูว่าส่วนใดพร้อมใช้งานและส่วนใดต้องตรวจจากระบบทางการ
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['หลักฐานพร้อมใช้', report.evidenceCount],
              ['ข้อเท็จจริงที่รับรอง', report.entityCount],
              ['ความสัมพันธ์ยืนยันแล้ว', report.verifiedRelationshipCount],
              ['จุดเชื่อมโยงข้ามคดี', report.crossCaseMatchCount],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>)}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold text-white">{dimension.label}</h3>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${statusStyle[dimension.status]}`}>{statusLabel[dimension.status]}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">{dimension.summary}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[10px] text-slate-500">
                  <span>{dimension.source}</span>
                  {dimension.actionHref && (dimension.actionHref.startsWith('http')
                    ? <a href={dimension.actionHref} target="_blank" rel="noreferrer" className="inline-flex items-center text-indigo-300 hover:text-indigo-200">เปิดแหล่งตรวจ <ExternalLink className="ml-1 h-3 w-3" /></a>
                    : <Link href={dimension.actionHref} className="inline-flex items-center text-indigo-300 hover:text-indigo-200">เปิดในระบบ <ExternalLink className="ml-1 h-3 w-3" /></Link>)}
                </div>
              </div>
            ))}
          </div>
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{report.notice}</p>
        </div>
      )}

      {selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="ร่างแฟ้มสืบสวน">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <div><h2 className="font-bold text-white">ร่างแฟ้มสืบสวนสำหรับตรวจทาน</h2><p className="mt-1 text-xs text-amber-200">ยังไม่ใช่หนังสือราชการฉบับลงนาม</p></div>
              <button type="button" onClick={() => setSelectedDocument(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="ปิด"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex gap-2 overflow-x-auto border-b border-slate-800 p-3">
              {documents.map((document) => <button key={document.id} type="button" onClick={() => setSelectedDocument(document)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs ${selectedDocument.id === document.id ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'}`}>{document.title}</button>)}
            </div>
            <div className="overflow-y-auto p-5 sm:p-7">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-white">{selectedDocument.title}</h3><p className="text-xs text-slate-500">{selectedDocument.purpose}</p></div><div className="flex gap-2"><button type="button" onClick={copyDocument} className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"><ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button><button type="button" onClick={downloadDocument} className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Download className="mr-1.5 h-3.5 w-3.5" />ดาวน์โหลด .txt</button></div></div>
              <pre className="whitespace-pre-wrap rounded-2xl border border-slate-800 bg-white p-6 font-sans text-sm leading-7 text-slate-950">{selectedDocument.plainText}</pre>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-800 px-5 py-3 text-[10px] text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />แสดงผลเป็น plain text ไม่มีการแทรก HTML จากข้อมูลคดี</div>
          </div>
        </div>
      )}
    </section>
  );
}
