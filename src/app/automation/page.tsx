'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileSearch,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { isEvidenceUsable } from '@/lib/evidence-file-status';

type AutomationStatus = 'QUEUED' | 'DISPATCHED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
type AutomationJob = {
  id: string;
  case_id: string;
  evidence_id: string;
  job_type: 'TEXT_EXTRACTION';
  status: AutomationStatus;
  page_number: number;
  input_sha256: string;
  attempt: number;
  max_attempts: number;
  result_count: number;
  error_code: string | null;
  error_message: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};
type Case = { id: string; number: string; title: string };
type Evidence = {
  id: string;
  case_id: string;
  filename: string;
  sha256: string;
  upload_state: string;
  malware_scan_status: string;
};

const statusMeta: Record<AutomationStatus, { label: string; color: string; icon: typeof Clock3 }> = {
  QUEUED: { label: 'รอส่งงาน', color: 'border-slate-400/15 bg-slate-400/[0.05] text-slate-300', icon: Clock3 },
  DISPATCHED: { label: 'ส่งเข้า n8n แล้ว', color: 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-200', icon: Workflow },
  RUNNING: { label: 'AI กำลังประมวลผล', color: 'border-indigo-400/20 bg-indigo-400/[0.06] text-indigo-200', icon: Bot },
  SUCCEEDED: { label: 'สร้างข้อเสนอแล้ว', color: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200', icon: CheckCircle2 },
  FAILED: { label: 'ต้องตรวจสอบ', color: 'border-rose-400/20 bg-rose-400/[0.06] text-rose-200', icon: TriangleAlert },
};

const activeStatuses = new Set<AutomationStatus>(['QUEUED', 'DISPATCHED', 'RUNNING']);
const pipelineSteps = [
  { number: '01', title: 'Validated input', description: 'รับเฉพาะหลักฐาน CLEAN', icon: ShieldCheck },
  { number: '02', title: 'Private dispatch', description: 'n8n เห็นเฉพาะ Job ID', icon: Workflow },
  { number: '03', title: 'AI suggestions', description: 'Gemini ไม่ยืนยันผลเอง', icon: Sparkles },
  { number: '04', title: 'Human control', description: 'เจ้าหน้าที่ตัดสินทุกข้อ', icon: FileSearch },
];

export default function AutomationPage() {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [mode, setMode] = useState<'demo' | 'production'>('demo');
  const [configured, setConfigured] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [form, setForm] = useState({ evidence_id: '', page_number: '1', source_text: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState(0);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const response = await fetch('/api/v1/automation/jobs', { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'โหลดงานอัตโนมัติไม่สำเร็จ');
      setJobs(body.data.jobs as AutomationJob[]);
      setCases(body.data.cases as Case[]);
      setEvidence(body.data.evidence as Evidence[]);
      setMode(body.data.mode as 'demo' | 'production');
      setConfigured(body.data.configured === true);
      setLastRefreshedAt(Date.now());
      setError('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'โหลดงานอัตโนมัติไม่สำเร็จ');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!jobs.some((job) => activeStatuses.has(job.status))) return;
    const timer = window.setInterval(() => void load(true), 4_000);
    return () => window.clearInterval(timer);
  }, [jobs, load]);

  const caseEvidence = useMemo(
    () => evidence.filter((item) => item.case_id === selectedCaseId),
    [evidence, selectedCaseId],
  );
  const cleanEvidence = useMemo(
    () => caseEvidence.filter((item) => isEvidenceUsable(item.upload_state, item.malware_scan_status)),
    [caseEvidence],
  );
  const evidenceById = useMemo(() => new Map(evidence.map((item) => [item.id, item])), [evidence]);
  const casesById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);

  const createJob = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId || !form.evidence_id) {
      setError('กรุณาเลือกคดีและหลักฐานที่จัดเก็บและตรวจรูปแบบไฟล์แล้ว');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/v1/automation/jobs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          case_id: selectedCaseId,
          evidence_id: form.evidence_id,
          page_number: Number(form.page_number),
          source_text: form.source_text,
          source_location: {},
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'เริ่มงานอัตโนมัติไม่สำเร็จ');
      setForm({ evidence_id: '', page_number: '1', source_text: '' });
      setSuccess('ส่งงานเข้า n8n แล้ว ระบบจะอัปเดตสถานะและนำข้อเสนอเข้าคิว Human Review อัตโนมัติ');
      await load(true);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'เริ่มงานอัตโนมัติไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const retry = async (job: AutomationJob) => {
    setRetryingId(job.id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/v1/automation/jobs/${encodeURIComponent(job.id)}/retry`, {
        method: 'POST', credentials: 'same-origin',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'ลองงานใหม่ไม่สำเร็จ');
      setSuccess(`ส่งงานรอบที่ ${body.data.attempt} เข้า n8n แล้ว`);
      await load(true);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'ลองงานใหม่ไม่สำเร็จ');
    } finally {
      setRetryingId('');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.045] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200"><Workflow className="h-3.5 w-3.5" /> ระบบประมวลผลอัตโนมัติ (Automation Pipeline)</div>
          <h1 className="text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">ศูนย์สั่งการระบบงานอัตโนมัติ</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">ระบบบริหารจัดการกระบวนการประมวลผลและสกัดข้อมูลพยานหลักฐานดิจิทัลอัตโนมัติ เพื่อนำส่งเข้าสู่คิวการตรวจทานและรับรองโดยเจ้าหน้าที่</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} className="secondary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold cursor-pointer"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />รีเฟรชสถานะ</button>
      </header>

      <section aria-label="สถานะระบบอัตโนมัติ" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pipelineSteps.map(({ number, title, description, icon: StepIcon }) => {
          return <div key={number} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-600">{number}</span><StepIcon className="h-4 w-4 text-cyan-300" /></div><p className="mt-4 text-xs font-bold text-slate-200">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">{description}</p></div>;
        })}
      </section>

      {(mode === 'demo' || !configured) && <div role="status" className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-100"><TriangleAlert className="mr-2 inline h-4 w-4" />{mode === 'demo' ? 'โหมดสาธิตแสดงหน้าจอและ state model เท่านั้น ไม่ส่งข้อมูลไป n8n' : 'ยังไม่ได้ตั้งค่า N8N_AUTOMATION_WEBHOOK_URL และ token ฝั่งเซิร์ฟเวอร์ ปุ่มเริ่มงานจึงถูกปิดอย่างปลอดภัย'}</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4 text-sm text-emerald-200">{success}</div>}
      {error && <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-sm text-rose-200">{error}</div>}

      <form onSubmit={createJob} className="glass-panel rounded-3xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Play className="h-5 w-5 text-cyan-300" />เริ่ม Text Extraction Pipeline</h2><p className="mt-2 text-xs leading-5 text-slate-500">ข้อความจะถูกเก็บในพื้นที่ปิดของ LawiRisk และลบทิ้งจาก job input เมื่อสร้างข้อเสนอสำเร็จ</p></div><span className="rounded-lg border border-white/[0.07] px-2 py-1 text-[9px] font-bold text-slate-500">V1</span></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_140px]">
          <label className="text-xs font-medium text-slate-300">คดี<select required value={selectedCaseId} onChange={(event) => { setSelectedCaseId(event.target.value); setForm((current) => ({ ...current, evidence_id: '' })); }} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#07121f] p-3 text-sm text-white"><option value="">เลือกคดี</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-300">หลักฐาน CLEAN<select required disabled={!selectedCaseId} value={form.evidence_id} onChange={(event) => setForm((current) => ({ ...current, evidence_id: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#07121f] p-3 text-sm text-white disabled:opacity-50"><option value="">เลือกหลักฐาน</option>{cleanEvidence.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-300">หน้า<input required type="number" min="1" max="100000" value={form.page_number} onChange={(event) => setForm((current) => ({ ...current, page_number: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#07121f] p-3 text-sm text-white" /></label>
          <label className="text-xs font-medium text-slate-300 md:col-span-2 xl:col-span-3">ข้อความต้นทาง<textarea required rows={6} minLength={1} maxLength={4000} value={form.source_text} onChange={(event) => setForm((current) => ({ ...current, source_text: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#07121f] p-3 text-sm leading-6 text-white" /><span className="mt-1 block text-[10px] text-slate-600">ห้ามวางรหัสผ่าน token หรือข้อมูลนอกขอบเขตคดี</span></label>
        </div>
        {selectedCaseId && cleanEvidence.length === 0 && <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-amber-100">คดีนี้ยังไม่มีหลักฐาน CLEAN จึงเริ่ม automation ไม่ได้</p>}
        <button type="submit" disabled={isSubmitting || mode === 'demo' || !configured || !selectedCaseId || cleanEvidence.length === 0} className="primary-action mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}ส่งเข้า n8n Pipeline<ArrowRight className="h-4 w-4" /></button>
      </form>

      <section aria-labelledby="automation-jobs-heading" className="space-y-4">
        <div className="flex items-center justify-between"><div><h2 id="automation-jobs-heading" className="text-lg font-bold text-white">งานล่าสุด</h2><p className="mt-1 text-xs text-slate-600">สถานะ active จะรีเฟรชอัตโนมัติทุก 4 วินาที</p></div><span className="text-xs text-slate-600">{jobs.length} jobs</span></div>
        {isLoading ? <div role="status" className="flex min-h-52 items-center justify-center rounded-3xl border border-white/[0.07] text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดงาน...</div> : jobs.length === 0 ? <div className="rounded-3xl border border-dashed border-white/[0.09] py-16 text-center"><Workflow className="mx-auto h-10 w-10 text-slate-800" /><p className="mt-4 text-sm text-slate-500">ยังไม่มีงานอัตโนมัติ</p></div> : <div className="grid gap-4 xl:grid-cols-2">{jobs.map((job) => {
          const meta = statusMeta[job.status];
          const StatusIcon = meta.icon;
          const evidenceItem = evidenceById.get(job.evidence_id);
          const caseItem = casesById.get(job.case_id);
          const stale = activeStatuses.has(job.status)
            && lastRefreshedAt > 0
            && lastRefreshedAt - new Date(job.updated_at).getTime() > 5 * 60_000;
          const retryable = (job.status === 'FAILED' || stale) && job.attempt < job.max_attempts;
          return <article key={job.id} className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{evidenceItem?.filename || job.evidence_id}</p><p className="mt-1 truncate text-[10px] text-slate-600">{caseItem ? `${caseItem.number} · ${caseItem.title}` : job.case_id} · หน้า {job.page_number}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.color}`}><StatusIcon className={`h-3.5 w-3.5 ${job.status === 'RUNNING' ? 'animate-pulse' : ''}`} />{meta.label}</span></div><div className="mt-5 grid grid-cols-4 gap-2" aria-label="ขั้นตอนประมวลผล">{['Queued', 'n8n', 'Gemini', 'Review'].map((stage, index) => { const progress = job.status === 'FAILED' ? Math.min(job.attempt, 2) : job.status === 'QUEUED' ? 1 : job.status === 'DISPATCHED' ? 2 : job.status === 'RUNNING' ? 3 : 4; const active = index < progress; return <div key={stage}><div className={`h-1 rounded-full ${active ? 'bg-gradient-to-r from-cyan-300 to-teal-300' : 'bg-white/[0.06]'}`} /><p className={`mt-2 text-[9px] ${active ? 'text-slate-300' : 'text-slate-700'}`}>{stage}</p></div>; })}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4"><div className="space-y-1 text-[10px] text-slate-600"><p>รอบ {job.attempt}/{job.max_attempts} · ผลลัพธ์ {job.result_count} ข้อเสนอ</p><p className="font-mono">Input SHA-256 {job.input_sha256.slice(0, 12)}…</p>{job.error_message && <p className="text-rose-300">{job.error_message}</p>}</div><div className="flex gap-2">{retryable && <button type="button" disabled={retryingId === job.id} onClick={() => void retry(job)} className="secondary-action inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold">{retryingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}ลองใหม่</button>}{job.status === 'SUCCEEDED' && <Link href="/review" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-300 px-3 text-xs font-bold text-emerald-950">เปิด Human Review<ArrowRight className="h-4 w-4" /></Link>}</div></div></article>;
        })}</div>}
      </section>
    </div>
  );
}
