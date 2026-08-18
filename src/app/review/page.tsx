'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Eye, Loader2, RefreshCw, Save, ShieldAlert, X } from 'lucide-react';
import type { Case, EvidenceFile } from '@/lib/demo-data';

type SuggestionStatus = 'SUGGESTED' | 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';
type Suggestion = {
  id: string;
  case_id: string;
  evidence_id: string;
  page_number: number;
  source_text: string;
  source_location: Record<string, unknown>;
  entity_type: string;
  candidate_value: string;
  confidence: number | null;
  reason: string;
  provider: string;
  model?: string | null;
  prompt_schema_version: string;
  status: SuggestionStatus;
  review_reason?: string | null;
  created_at: string;
};

const entityTypes = ['PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION'] as const;

export default function ReviewPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [mode, setMode] = useState<'demo' | 'production'>('production');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [manual, setManual] = useState({ evidence_id: '', page_number: '1', source_text: '', entity_type: 'PERSON', candidate_value: '', reason: '' });

  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve();
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/v1/review', { signal, credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'โหลดคิวตรวจทานไม่สำเร็จ');
      setSuggestions(body.data.suggestions as Suggestion[]);
      setCases(body.data.cases as Case[]);
      setEvidence(body.data.evidence as EvidenceFile[]);
      setMode(body.data.mode as 'demo' | 'production');
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : 'โหลดคิวตรวจทานไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/review', { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดคิวตรวจทานไม่สำเร็จ');
        setSuggestions(body.data.suggestions as Suggestion[]);
        setCases(body.data.cases as Case[]);
        setEvidence(body.data.evidence as EvidenceFile[]);
        setMode(body.data.mode as 'demo' | 'production');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'โหลดคิวตรวจทานไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const caseEvidence = useMemo(() => evidence.filter((item) => !selectedCaseId || item.case_id === selectedCaseId), [evidence, selectedCaseId]);
  const visibleSuggestions = useMemo(() => suggestions.filter((item) => !selectedCaseId || item.case_id === selectedCaseId), [suggestions, selectedCaseId]);

  const createManualSuggestion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId || !manual.evidence_id) {
      setActionError('กรุณาเลือกคดีและหลักฐานต้นทาง');
      return;
    }
    setSubmitting('manual');
    setActionError('');
    setSuccess('');
    try {
      const response = await fetch('/api/v1/review', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: selectedCaseId,
          evidence_id: manual.evidence_id,
          page_number: Number(manual.page_number),
          source_text: manual.source_text,
          source_location: {},
          entity_type: manual.entity_type,
          candidate_value: manual.candidate_value,
          reason: manual.reason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'สร้างข้อเสนอไม่สำเร็จ');
      setManual({ evidence_id: '', page_number: '1', source_text: '', entity_type: 'PERSON', candidate_value: '', reason: '' });
      setSuccess('สร้างข้อเสนอแบบ manual แล้ว สถานะยังเป็น SUGGESTED และต้องให้ผู้ตรวจทานตัดสิน');
      await load();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'สร้างข้อเสนอไม่สำเร็จ');
    } finally {
      setSubmitting('');
    }
  };

  const review = async (item: Suggestion, decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN') => {
    const reason = reviewReasons[item.id]?.trim();
    if (!reason) {
      setActionError('กรุณาระบุเหตุผลของผู้ตรวจทาน');
      return;
    }
    setSubmitting(item.id);
    setActionError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/v1/review/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason, edited_value: editedValues[item.id]?.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกผลตรวจทานไม่สำเร็จ');
      setSuggestions((current) => current.map((record) => record.id === item.id ? { ...record, status: decision, review_reason: reason, candidate_value: editedValues[item.id]?.trim() || record.candidate_value } : record));
      setSuccess('บันทึกผลตรวจทานและ audit event แล้ว');
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'บันทึกผลตรวจทานไม่สำเร็จ');
    } finally {
      setSubmitting('');
    }
  };

  const openEvidence = async (item: Suggestion) => {
    setActionError('');
    try {
      const response = await fetch(`/api/v1/evidence/${encodeURIComponent(item.evidence_id)}/download`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'เปิดหลักฐานไม่สำเร็จ');
      window.open(body.data.url, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'เปิดหลักฐานไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-8">
      <header><h1 className="flex items-center gap-3 text-3xl font-extrabold text-white"><Eye className="h-8 w-8 text-indigo-500" />Human Review Workspace</h1><p className="mt-2 text-slate-400">ข้อเสนอทุกชิ้นแสดงที่มา รุ่น schema เหตุผล และตำแหน่งในหลักฐาน การยืนยันจะล้มเหลวหากต้นฉบับยังไม่สแกนเป็น CLEAN</p></header>
      {mode === 'demo' && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">โหมดสาธิตไม่บันทึกผล review ลงฐานข้อมูลจริง</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">{success}</div>}
      {actionError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{actionError}</div>}

      <div className="rounded-3xl border border-slate-900 bg-slate-900/30 p-5"><label htmlFor="case-filter" className="text-xs font-semibold text-slate-300">กรองตามคดี</label><select id="case-filter" value={selectedCaseId} onChange={(event) => { setSelectedCaseId(event.target.value); setManual((current) => ({ ...current, evidence_id: '' })); }} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"><option value="">ทุกคดีที่เข้าถึงได้</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}</select></div>

      <form onSubmit={createManualSuggestion} className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
        <div className="flex items-center gap-2"><Save className="h-5 w-5 text-teal-300" /><h2 className="font-bold text-white">Manual fallback: สร้างข้อเสนอจากต้นฉบับ</h2></div>
        <p className="mt-2 text-xs text-slate-500">ใช้เมื่อ OCR/AI ไม่พร้อม ข้อเสนอยังคงต้องผ่านผู้ตรวจทานอีกครั้ง</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs text-slate-300">หลักฐาน<select required disabled={!selectedCaseId || mode === 'demo'} value={manual.evidence_id} onChange={(event) => setManual((current) => ({ ...current, evidence_id: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"><option value="">เลือกไฟล์</option>{caseEvidence.map((item) => <option key={item.id} value={item.id}>{item.filename} · {item.malware_scan_status || 'PENDING'}</option>)}</select></label>
          <label className="text-xs text-slate-300">หน้า<input required type="number" min="1" max="100000" value={manual.page_number} onChange={(event) => setManual((current) => ({ ...current, page_number: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300">ประเภท<select value={manual.entity_type} onChange={(event) => setManual((current) => ({ ...current, entity_type: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white">{entityTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="text-xs text-slate-300 md:col-span-2">ข้อความต้นทาง<textarea required maxLength={4000} rows={3} value={manual.source_text} onChange={(event) => setManual((current) => ({ ...current, source_text: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300">ค่าที่เสนอ<input required maxLength={1000} value={manual.candidate_value} onChange={(event) => setManual((current) => ({ ...current, candidate_value: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300 md:col-span-2 xl:col-span-3">เหตุผลที่เสนอ<textarea required maxLength={2000} rows={2} value={manual.reason} onChange={(event) => setManual((current) => ({ ...current, reason: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
        </div>
        <button type="submit" disabled={submitting === 'manual' || mode === 'demo' || !selectedCaseId} className="mt-5 inline-flex items-center rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{submitting === 'manual' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}สร้างข้อเสนอ SUGGESTED</button>
      </form>

      {isLoading ? <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-900 text-sm text-slate-400" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดคิวตรวจทาน...</div> : loadError ? <div className="rounded-3xl border border-rose-500/20 p-10 text-center" role="alert"><p className="text-sm text-rose-300">{loadError}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center rounded-xl border border-rose-400/20 px-4 py-2 text-xs text-rose-200"><RefreshCw className="mr-2 h-4 w-4" />ลองใหม่</button></div> : visibleSuggestions.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-800 py-20 text-center text-sm text-slate-500">ยังไม่มีข้อเสนอในขอบเขตที่เลือก</div> : <div className="space-y-5">{visibleSuggestions.map((item) => { const source = evidence.find((record) => record.id === item.evidence_id); return <article key={item.id} className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-indigo-300">{item.entity_type}</span><span className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300">{item.status}</span><span className="text-slate-500">{item.provider}{item.model ? ` / ${item.model}` : ''} · schema {item.prompt_schema_version}</span></div><div className="mt-4 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="space-y-3"><p className="text-lg font-bold text-white">{item.candidate_value}</p><p className="text-sm text-slate-400">เหตุผลข้อเสนอ: {item.reason}</p><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-xs font-semibold text-teal-300">{source?.filename || item.evidence_id} · หน้า {item.page_number}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{item.source_text}</p></div><button type="button" onClick={() => void openEvidence(item)} className="inline-flex items-center text-xs font-semibold text-indigo-300"><ExternalLink className="mr-1 h-4 w-4" />เปิดต้นฉบับด้วย signed URL 60 วินาที</button></div>{item.status === 'SUGGESTED' ? <div className="space-y-3"><label className="text-xs text-slate-300">แก้ค่าก่อนยืนยัน (ถ้าจำเป็น)<input value={editedValues[item.id] ?? item.candidate_value} onChange={(event) => setEditedValues((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label><label className="text-xs text-slate-300">เหตุผลผู้ตรวจทาน<textarea rows={3} maxLength={2000} value={reviewReasons[item.id] || ''} onChange={(event) => setReviewReasons((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label><div className="grid grid-cols-3 gap-2"><button type="button" disabled={submitting === item.id} onClick={() => void review(item, 'REJECTED')} className="flex items-center justify-center rounded-xl border border-rose-500/20 p-2 text-xs text-rose-300"><X className="mr-1 h-4 w-4" />ปฏิเสธ</button><button type="button" disabled={submitting === item.id} onClick={() => void review(item, 'UNCERTAIN')} className="flex items-center justify-center rounded-xl border border-amber-500/20 p-2 text-xs text-amber-300"><ShieldAlert className="mr-1 h-4 w-4" />ไม่แน่ใจ</button><button type="button" disabled={submitting === item.id || source?.malware_scan_status !== 'CLEAN'} onClick={() => void review(item, 'CONFIRMED')} className="flex items-center justify-center rounded-xl bg-indigo-600 p-2 text-xs text-white disabled:opacity-50">{submitting === item.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}ยืนยัน</button></div></div> : <div className="rounded-xl border border-white/[0.06] p-4 text-sm text-slate-400">เหตุผลผลตรวจทาน: {item.review_reason || '-'}</div>}</div></article>; })}</div>}
    </div>
  );
}
