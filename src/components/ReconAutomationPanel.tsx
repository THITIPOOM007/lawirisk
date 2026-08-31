'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, DatabaseZap, FileCheck2, Loader2, Orbit, ScanSearch, ShieldCheck, WifiOff } from 'lucide-react';
import { importPdfIntoEvidenceVault } from '@/lib/evidence-browser-import';
import { executeLocalReconQuery, markLocalReconImported, type LocalReconResult } from '@/lib/recon-browser-client';
import type { ReconAutomationPlanItem, ReconBlockedAutomation } from '@/lib/recon-automation';

type JobStatus = 'QUEUED' | 'AUTHORIZING' | 'LAUNCHING' | 'SEARCHING' | 'DOWNLOADING' | 'IMPORTING' | 'REGISTERING' | 'COMPLETE' | 'FAILED';
type DisplayJob = ReconAutomationPlanItem & {
  status: JobStatus;
  progress?: number;
  result?: LocalReconResult;
  evidenceId?: string;
  error?: string;
};

export type ReconExecutionOutcome = {
  planId: string;
  sourceLabel: string;
  serviceLabel: string;
  fieldLabel: string;
  displayValue: string;
  status: 'COMPLETE' | 'FAILED';
  result?: LocalReconResult;
  evidenceId?: string;
  error?: string;
};

const statusLabel: Record<JobStatus, string> = {
  QUEUED: 'รอค้น', AUTHORIZING: 'ตรวจสิทธิ์', LAUNCHING: 'เปิดระบบต้นทาง', SEARCHING: 'กำลังค้นจริง',
  DOWNLOADING: 'รับ PDF ผลค้น', IMPORTING: 'นำเข้าคลังหลักฐาน', REGISTERING: 'บันทึกสายการครอบครอง', COMPLETE: 'เสร็จสมบูรณ์', FAILED: 'ค้นไม่สำเร็จ',
};

const runningStatuses = new Set<JobStatus>(['AUTHORIZING', 'LAUNCHING', 'SEARCHING', 'DOWNLOADING', 'IMPORTING', 'REGISTERING']);

export function ReconAutomationPanel(props: {
  caseId: string;
  plan: ReconAutomationPlanItem[];
  blocked: ReconBlockedAutomation[];
  executionId: number;
  onRunningChange?: (running: boolean) => void;
  onFinished?: (outcomes: ReconExecutionOutcome[]) => void;
}) {
  const { caseId, plan, blocked, executionId, onRunningChange, onFinished } = props;
  const [jobs, setJobs] = useState<DisplayJob[]>(() => plan.map((item) => ({ ...item, status: 'QUEUED' })));
  const lastExecution = useRef(0);

  useEffect(() => {
    if (!executionId || executionId === lastExecution.current || plan.length === 0) return;
    lastExecution.current = executionId;
    const controller = new AbortController();
    const initialJobs: DisplayJob[] = plan.map((item) => ({ ...item, status: 'QUEUED' }));
    setJobs(initialJobs);
    onRunningChange?.(true);

    const update = (id: string, patch: Partial<DisplayJob>) => {
      setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
    };

    void (async () => {
      const outcomes: ReconExecutionOutcome[] = [];
      try {
        for (const item of plan) {
          if (controller.signal.aborted) break;
          try {
          const local = await executeLocalReconQuery(caseId, item, {
            signal: controller.signal,
            onState: (status) => update(item.id, { status: status as JobStatus }),
          });
          update(item.id, { status: 'IMPORTING', result: local.result, progress: 0 });
          const evidence = await importPdfIntoEvidenceVault({
            caseId,
            file: local.file,
            expectedSha256: local.result.pdfSha256,
            onProgress: (progress) => update(item.id, { progress }),
          });
          update(item.id, { status: 'REGISTERING', evidenceId: evidence.id, progress: 100 });
          const captureResponse = await fetch('/api/v1/intelligence/recon/captures', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              case_id: caseId,
              evidence_id: evidence.id,
              source: item.source,
              service: item.service,
              search_field: item.field,
              pdf_sha256: local.result.pdfSha256,
              result_row_count: local.result.resultRowCount,
              captured_at: local.result.capturedAt,
              source_url: local.result.sourceUrl,
              adapter_version: local.result.adapterVersion,
              search_strategy: local.result.searchStrategy,
              search_attempt_count: local.result.searchAttemptCount,
              basis_status: item.basisStatus,
            }),
            signal: controller.signal,
          });
          const captureBody = await captureResponse.json().catch(() => null) as { error?: { message?: string } } | null;
          if (!captureResponse.ok) throw new Error(captureBody?.error?.message || 'บันทึกสายการครอบครองผลค้นไม่สำเร็จ');
          await markLocalReconImported(local.jobId, evidence.id);
          update(item.id, { status: 'COMPLETE', evidenceId: evidence.id, progress: 100 });
            outcomes.push({ planId: item.id, sourceLabel: item.sourceLabel, serviceLabel: item.serviceLabel, fieldLabel: item.fieldLabel, displayValue: item.displayValue, status: 'COMPLETE', result: local.result, evidenceId: evidence.id });
            window.dispatchEvent(new Event('ev-data-change'));
          }
          catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') break;
            const message = error instanceof Error ? error.message : 'งานค้นไม่สำเร็จ';
            outcomes.push({ planId: item.id, sourceLabel: item.sourceLabel, serviceLabel: item.serviceLabel, fieldLabel: item.fieldLabel, displayValue: item.displayValue, status: 'FAILED', error: message });
            update(item.id, { status: 'FAILED', error: message });
          }
        }
      }
      finally {
        onRunningChange?.(false);
        if (!controller.signal.aborted) onFinished?.(outcomes);
      }
    })();
    return () => {
      controller.abort();
      onRunningChange?.(false);
    };
  }, [caseId, executionId, onFinished, onRunningChange, plan]);

  if (plan.length === 0 && blocked.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-slate-950/45 p-4 sm:p-5" aria-label="สถานะการค้นข้อมูลอัตโนมัติจากระบบต้นทาง">
      <div aria-hidden="true" className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/[0.08] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300/65">Automated source acquisition</p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-black text-white"><Orbit className="h-5 w-5 text-cyan-300" />งานค้นอัตโนมัติจากระบบทางการ</h3>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-400">แต่ละงานแสดงข้อมูลที่ใช้ค้น ช่องของระบบต้นทาง ผลที่ระบบแสดง และไฟล์หลักฐานที่นำกลับเข้าคลังโดยอัตโนมัติ</p>
        </div>
        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 font-mono text-[9px] font-bold text-cyan-200">{jobs.filter((job) => job.status === 'COMPLETE').length}/{jobs.length} CAPTURED</span>
      </div>

      <div className="relative mt-4 space-y-3" aria-live="polite">
        {jobs.map((job, index) => (
          <article key={job.id} className={`overflow-hidden rounded-3xl border ${job.status === 'COMPLETE' ? 'border-emerald-300/20 bg-emerald-300/[0.04]' : job.status === 'FAILED' ? 'border-rose-300/20 bg-rose-300/[0.04]' : 'border-white/[0.07] bg-slate-900/55'}`}>
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] font-mono text-[10px] font-black text-cyan-200">{String(index + 1).padStart(2, '0')}</span>
                  <div><h4 className="text-sm font-black text-white">{job.sourceLabel} · {job.serviceLabel}</h4><p className="mt-0.5 text-[10px] text-slate-500">ช่องค้น: <span className="font-bold text-slate-300">{job.fieldLabel}</span> · ค่า: <span className="font-mono text-cyan-200">{job.displayValue}</span></p></div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.055] bg-slate-950/40 p-3"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">เหตุผลที่ใช้ค่านี้</p><p className="mt-1 text-[10px] leading-5 text-slate-300">{job.basisLabel} จาก {job.filename} หน้า {job.pageNumber}{typeof job.confidence === 'number' ? ` · ความเชื่อมั่น ${Math.round(job.confidence * 100)}%` : ''}</p></div>
                  <div className="rounded-xl border border-white/[0.055] bg-slate-950/40 p-3"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">ผลนี้หมายความว่าอะไร</p><p className="mt-1 text-[10px] leading-5 text-slate-300">{job.result ? (job.result.resultRowCount > 0 ? `ระบบต้นทางแสดง ${job.result.resultRowCount} รายการที่ผูกกับคำค้นนี้ ต้องตรวจรายละเอียดใน PDF ก่อนยืนยันว่าเป็นบุคคลหรือกิจการเดียวกัน` : 'หน้าผลค้นไม่แสดงรายการ ณ เวลาที่ค้น ซึ่งยังไม่ใช่ข้อยืนยันว่าไม่มีทะเบียนหรือใบอนุญาต') : 'ระบบจะอธิบายความหมายหลังได้รับผลจากต้นทาง โดยไม่ตีความเป็นความผิดหรือยืนยันตัวตนอัตโนมัติ'}</p></div>
                </div>
              </div>
              <div className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[10px] font-bold ${job.status === 'COMPLETE' ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200' : job.status === 'FAILED' ? 'border-rose-300/20 bg-rose-300/[0.08] text-rose-200' : 'border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-200'}`}>
                {runningStatuses.has(job.status) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : job.status === 'COMPLETE' ? <CheckCircle2 className="h-3.5 w-3.5" /> : job.status === 'FAILED' ? <WifiOff className="h-3.5 w-3.5" /> : <ScanSearch className="h-3.5 w-3.5" />}{statusLabel[job.status]}{job.status === 'IMPORTING' && typeof job.progress === 'number' ? ` ${job.progress}%` : ''}
              </div>
            </div>

            {job.error && <div role="alert" className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-3 text-[10px] leading-5 text-rose-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{job.error}</div>}

            {job.result && (
              <div className="border-t border-white/[0.07] bg-slate-950/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="flex items-center gap-2 text-xs font-black text-white"><DatabaseZap className="h-4 w-4 text-indigo-300" />ข้อมูลที่ระบบต้นทางแสดง</h5><span className="font-mono text-[9px] text-slate-500">{new Date(job.result.capturedAt).toLocaleString('th-TH')} · {job.result.searchStrategy}</span></div>
                {job.result.resultSummaries.length > 0 ? <ol className="mt-3 grid gap-2 lg:grid-cols-2">{job.result.resultSummaries.map((summary, resultIndex) => <li key={`${job.id}:${resultIndex}`} className="rounded-xl border border-indigo-300/10 bg-indigo-300/[0.035] p-3 text-[10px] leading-5 text-slate-300"><span className="mr-2 font-mono font-black text-indigo-300">RESULT {String(resultIndex + 1).padStart(2, '0')}</span>{summary}</li>)}</ol> : <p className="mt-3 rounded-xl border border-dashed border-slate-700 p-3 text-[10px] leading-5 text-slate-400">ไม่พบแถวข้อมูลในหน้าผลค้น ระบบเก็บ PDF ของหน้าผลและเวลาไว้เพื่อให้ตรวจสอบย้อนหลังได้</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /><span>PDF SHA-256 {job.result.pdfSha256}</span>{job.evidenceId && <><span>·</span><Link href="/evidence" className="inline-flex items-center gap-1 font-bold text-emerald-200 hover:text-emerald-100"><FileCheck2 className="h-3.5 w-3.5" />เปิดหลักฐานที่นำเข้าแล้ว</Link></>}</div>
              </div>
            )}
          </article>
        ))}
      </div>

      {blocked.length > 0 && <div className="relative mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4"><h4 className="flex items-center gap-2 text-xs font-black text-amber-100"><AlertTriangle className="h-4 w-4" />งานที่ระบบพักไว้เพื่อความปลอดภัย</h4><div className="mt-2 space-y-2">{blocked.map((item) => <div key={item.id} className="rounded-xl border border-white/[0.05] bg-slate-950/35 p-3 text-[10px] leading-5 text-slate-300"><span className="font-bold text-amber-200">{item.sourceLabel} · {item.fieldLabel} {item.displayValue}</span><span className="mt-1 block text-slate-500">{item.reason}</span></div>)}</div></div>}
    </section>
  );
}
