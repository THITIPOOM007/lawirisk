'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, CircleAlert, Copy, Download, FileBarChart, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Case } from '@/lib/demo-data';

type ReportRecord = {
  id: string;
  case_id: string;
  title: string;
  report_type?: 'SUMMARY' | 'OVERLAP';
  content: string;
  snapshot_sha256?: string | null;
  created_at?: string;
};

type ReportReadiness = {
  eligible: boolean;
  code: 'READY' | 'USABLE_EVIDENCE_REQUIRED' | 'VERIFIED_SOURCE_REQUIRED' | 'FORBIDDEN' | 'READINESS_FAILED';
  message: string;
  usable_evidence_count?: number;
  source_mention_count?: number;
  relationship_reference_count?: number;
};

export default function ReportsPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [reportType, setReportType] = useState<'SUMMARY' | 'OVERLAP'>('SUMMARY');
  const [title, setTitle] = useState('');
  const [activeReport, setActiveReport] = useState<ReportRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [caseResponse, reportResponse] = await Promise.all([
        fetch('/api/v1/cases', { credentials: 'same-origin' }),
        fetch('/api/v1/reports', { credentials: 'same-origin' }),
      ]);
      const [caseBody, reportBody] = await Promise.all([caseResponse.json(), reportResponse.json()]);
      if (!caseResponse.ok) throw new Error(caseBody.error?.message || 'โหลดรายการคดีไม่สำเร็จ');
      if (!reportResponse.ok) throw new Error(reportBody.error?.message || 'โหลดรายงานไม่สำเร็จ');
      setCases(caseBody.data as Case[]);
      setReports(reportBody.data as ReportRecord[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลรายงานไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/v1/cases', { credentials: 'same-origin', signal: controller.signal }),
      fetch('/api/v1/reports', { credentials: 'same-origin', signal: controller.signal }),
    ]).then(async ([caseResponse, reportResponse]) => {
      const [caseBody, reportBody] = await Promise.all([caseResponse.json(), reportResponse.json()]);
      if (!caseResponse.ok) throw new Error(caseBody.error?.message || 'โหลดรายการคดีไม่สำเร็จ');
      if (!reportResponse.ok) throw new Error(reportBody.error?.message || 'โหลดรายงานไม่สำเร็จ');
      setCases(caseBody.data as Case[]);
      setReports(reportBody.data as ReportRecord[]);
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลรายงานไม่สำเร็จ');
    }).finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedCaseId) return;

    const controller = new AbortController();
    fetch(`/api/v1/reports/readiness?case_id=${encodeURIComponent(selectedCaseId)}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) {
        const code = response.status === 403 ? 'FORBIDDEN' : 'READINESS_FAILED';
        setReadiness({ eligible: false, code, message: body.error?.message || 'ตรวจความพร้อมสำหรับสร้างรายงานไม่สำเร็จ' });
        return;
      }
      setReadiness(body.data as ReportReadiness);
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setReadiness({ eligible: false, code: 'READINESS_FAILED', message: 'ตรวจความพร้อมสำหรับสร้างรายงานไม่สำเร็จ กรุณาลองใหม่' });
    }).finally(() => {
      if (!controller.signal.aborted) setIsCheckingReadiness(false);
    });
    return () => controller.abort();
  }, [selectedCaseId]);

  const selectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setReadiness(null);
    setIsCheckingReadiness(Boolean(caseId));
    setError('');
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId) return setError('กรุณาเลือกสำนวนคดี');
    setIsGenerating(true);
    setError('');
    setCopied(false);
    try {
      const response = await fetch('/api/v1/reports', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: selectedCaseId, report_type: reportType, ...(title.trim() ? { title: title.trim() } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setReadiness({ eligible: false, code: 'VERIFIED_SOURCE_REQUIRED', message: body.error?.message || 'ข้อมูลต้นทางยังไม่พร้อมสร้างรายงาน' });
        }
        throw new Error(body.error?.message || 'สร้างรายงานไม่สำเร็จ');
      }
      const report = body.data as ReportRecord;
      setActiveReport(report);
      setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'สร้างรายงานไม่สำเร็จ');
    } finally {
      setIsGenerating(false);
    }
  };

  const copy = async () => {
    if (!activeReport) return;
    await navigator.clipboard.writeText(activeReport.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-white">
          <FileBarChart className="h-8 w-8 text-indigo-500" />
          รายงานสรุปสำนวนคดีและการเชื่อมโยงพยานหลักฐาน
        </h1>
        <p className="mt-2 text-slate-400">
          รายงานทุกฉบับประมวลผลจากข้อมูลพยานหลักฐานที่ได้รับการรับรองและมีเอกสารอ้างอิงชัดเจน โดยจัดเก็บ Snapshot รหัส SHA-256 เพื่อความโปร่งใสและตรวจสอบย้อนกลับได้
        </p>
      </header>
      {error && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <form onSubmit={generate} className="space-y-5 rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
            <h2 className="font-bold text-white">สร้างรายงานสรุป (Snapshot)</h2>
            <label className="block text-xs font-semibold text-slate-300">เลือกสำนวนคดี<select value={selectedCaseId} onChange={(event) => selectCase(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"><option value="">เลือกสำนวนคดี</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-300">ประเภทรายงาน<select value={reportType} onChange={(event) => setReportType(event.target.value as 'SUMMARY' | 'OVERLAP')} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"><option value="SUMMARY">รายงานสรุปสาระสำคัญของสำนวนคดี</option><option value="OVERLAP">รายงานการวิเคราะห์ความเชื่อมโยงข้ามคดี</option></select></label>
            <label className="block text-xs font-semibold text-slate-300">หัวข้อรายงาน (ไม่บังคับ)<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="ระบุชื่อเอกสารรายงาน..." className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
            {selectedCaseId && (
              <div aria-live="polite" className={`rounded-2xl border p-4 ${readiness?.eligible ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-amber-400/20 bg-amber-400/[0.06]'}`}>
                {isCheckingReadiness ? (
                  <p className="flex items-center text-xs text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังตรวจความพร้อมของหลักฐานและแหล่งอ้างอิง...</p>
                ) : readiness ? (
                  <div className="flex items-start gap-3">
                    {readiness.eligible ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                    <div className="min-w-0">
                      <p className={`text-xs font-bold ${readiness.eligible ? 'text-emerald-200' : 'text-amber-200'}`}>{readiness.eligible ? 'พร้อมสร้างรายงาน' : 'ยังสร้างรายงานไม่ได้'}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">{readiness.message}</p>
                      {!readiness.eligible && readiness.code === 'USABLE_EVIDENCE_REQUIRED' && <Link href="/evidence" className="mt-2 inline-flex text-[11px] font-bold text-teal-300 hover:underline">ไปอัปโหลดและตรวจหลักฐาน →</Link>}
                      {!readiness.eligible && readiness.code === 'VERIFIED_SOURCE_REQUIRED' && <Link href="/review" className="mt-2 inline-flex text-[11px] font-bold text-teal-300 hover:underline">ไปสกัดข้อมูลและตรวจทาน →</Link>}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            <button disabled={isGenerating || !selectedCaseId || isCheckingReadiness || !readiness?.eligible} className="flex w-full cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}สร้างเอกสารรายงาน</button>
            <p className="text-[11px] leading-relaxed text-slate-500">รายงานนี้จัดทำขึ้นเพื่อสนับสนุนการสืบสวนและรวบรวมพยานหลักฐานทางคดี</p>
          </form>
          <section className="rounded-3xl border border-slate-900 bg-slate-900/20 p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-bold text-white">รายงานที่จัดเก็บ</h2><button type="button" onClick={() => void load()} className="text-slate-400" aria-label="รีเฟรช"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button></div>
            {isLoading ? <p className="text-xs text-slate-500">กำลังโหลด...</p> : reports.length ? <div className="space-y-2">{reports.map((item) => <button key={item.id} type="button" onClick={() => setActiveReport(item)} className="w-full rounded-xl border border-slate-800 p-3 text-left hover:border-indigo-500/50"><span className="block truncate text-xs font-semibold text-slate-200">{item.title}</span><span className="mt-1 block text-[10px] text-slate-600">{item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : item.id}</span></button>)}</div> : <p className="text-xs text-slate-500">ยังไม่มีรายงานที่จัดเก็บ</p>}
          </section>
        </div>
        <section className="min-h-[560px] rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
          {activeReport ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-bold text-white text-base">{activeReport.title}</h2>
                  {activeReport.snapshot_sha256 && (
                    <p className="mt-1 break-all font-mono text-[10px] text-emerald-400">
                      Snapshot SHA-256: {activeReport.snapshot_sha256}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    {copied ? <Check className="mr-2 h-4 w-4 text-emerald-400" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                  </button>
                  <a
                    href={`/api/v1/reports/${activeReport.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg transition-all"
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    ส่งออก PDF (Export PDF)
                  </a>
                </div>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-300 bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                {activeReport.content}
              </pre>
            </div>
          ) : (
            <div className="flex min-h-[500px] items-center justify-center text-center">
              <div>
                <FileBarChart className="mx-auto h-12 w-12 text-slate-800" />
                <p className="mt-4 text-sm text-slate-500">เลือกรายงานเดิมหรือสร้าง snapshot ใหม่</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
