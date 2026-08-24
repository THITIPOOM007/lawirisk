'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, Fingerprint, Loader2, RefreshCw, Save, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { Case, EvidenceFile } from '@/lib/demo-data';
import { BiometricStepUpModal } from '@/components/BiometricStepUpModal';
import { evidenceSafetyLabel, isEvidenceUsable } from '@/lib/evidence-file-status';

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
  const [stepUpTarget, setStepUpTarget] = useState<{ item: Suggestion; decision: 'CONFIRMED' } | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [aiInput, setAiInput] = useState({ evidence_id: '', page_number: '1', source_text: '' });
  const [manual, setManual] = useState({ evidence_id: '', page_number: '1', source_text: '', entity_type: 'PERSON', candidate_value: '', reason: '' });

  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve();
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/v1/review', { signal, credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'โหลดข้อมูลคิวตรวจทานไม่สำเร็จ');
      setSuggestions(body.data.suggestions as Suggestion[]);
      setCases(body.data.cases as Case[]);
      setEvidence(body.data.evidence as EvidenceFile[]);
      setMode(body.data.mode as 'demo' | 'production');
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลคิวตรวจทานไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/review', { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดข้อมูลคิวตรวจทานไม่สำเร็จ');
        setSuggestions(body.data.suggestions as Suggestion[]);
        setCases(body.data.cases as Case[]);
        setEvidence(body.data.evidence as EvidenceFile[]);
        setMode(body.data.mode as 'demo' | 'production');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลคิวตรวจทานไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const caseEvidence = useMemo(() => evidence.filter((item) => !selectedCaseId || item.case_id === selectedCaseId), [evidence, selectedCaseId]);
  const cleanCaseEvidence = useMemo(() => caseEvidence.filter((item) => isEvidenceUsable(item.upload_state, item.malware_scan_status)), [caseEvidence]);
  const visibleSuggestions = useMemo(() => suggestions.filter((item) => !selectedCaseId || item.case_id === selectedCaseId), [suggestions, selectedCaseId]);

  const createAiSuggestions = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId || !aiInput.evidence_id) {
      setActionError('กรุณาเลือกสำนวนคดีและเอกสารหลักฐานที่ผ่านการตรวจความปลอดภัย (CLEAN)');
      return;
    }
    setSubmitting('ai');
    setActionError('');
    setSuccess('');
    try {
      const response = await fetch('/api/v1/ai/extract', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: selectedCaseId,
          evidence_id: aiInput.evidence_id,
          page_number: Number(aiInput.page_number),
          source_text: aiInput.source_text,
          source_location: {},
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'การวิเคราะห์สกัดข้อมูลไม่สำเร็จ');
      const count = Number(body.data?.count || 0);
      if (mode === 'demo' && Array.isArray(body.data?.suggestions)) {
        setSuggestions((current) => [...body.data.suggestions, ...current]);
      }
      setAiInput({ evidence_id: '', page_number: '1', source_text: '' });
      setSuccess(count > 0
        ? `ระบบประมวลผลข้อเสนอแนะสำเร็จ ${count} รายการ (สถานะ SUGGESTED รอการตรวจทานรับรอง)`
        : 'ระบบไม่พบข้อมูลที่ตรงตามเกณฑ์จากข้อความที่ระบุ');
      if (mode !== 'demo') await load();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'การวิเคราะห์สกัดข้อมูลไม่สำเร็จ กรุณาใช้การบันทึกข้อมูลด้วยตนเอง');
    } finally {
      setSubmitting('');
    }
  };

  const createManualSuggestion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId || !manual.evidence_id) {
      setActionError('กรุณาเลือกสำนวนคดีและเอกสารหลักฐานอ้างอิง');
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
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกข้อมูลไม่สำเร็จ');
      if (mode === 'demo' && body.data) setSuggestions((current) => [body.data as Suggestion, ...current]);
      setManual({ evidence_id: '', page_number: '1', source_text: '', entity_type: 'PERSON', candidate_value: '', reason: '' });
      setSuccess('บันทึกข้อมูลเสนอตรวจทานเรียบร้อยแล้ว (สถานะ SUGGESTED รอเจ้าหน้าที่ผู้รับผิดชอบรับรอง)');
      if (mode !== 'demo') await load();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting('');
    }
  };

  const review = async (item: Suggestion, decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN') => {
    const reason = reviewReasons[item.id]?.trim();
    if (!reason) {
      setActionError('กรุณาระบุเหตุผลการพิจารณาของผู้ตรวจทาน');
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
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกผลการตรวจทานไม่สำเร็จ');
      setSuggestions((current) => current.map((record) => record.id === item.id ? { ...record, status: decision, review_reason: reason, candidate_value: editedValues[item.id]?.trim() || record.candidate_value } : record));
      setSuccess('บันทึกผลการตรวจทานและบันทึกประวัติการใช้งาน (Audit Log) เรียบร้อยแล้ว');
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'บันทึกผลการตรวจทานไม่สำเร็จ');
    } finally {
      setSubmitting('');
    }
  };

  const openEvidence = async (item: Suggestion) => {
    setActionError('');
    try {
      const response = await fetch(`/api/v1/evidence/${encodeURIComponent(item.evidence_id)}/download`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'เปิดเอกสารหลักฐานไม่สำเร็จ');
      window.open(body.data.url, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'เปิดเอกสารหลักฐานไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold text-white">
          <Eye className="h-8 w-8 text-indigo-500" />
          ศูนย์ตรวจทานและรับรองข้อมูลพยานหลักฐาน
        </h1>
        <p className="mt-2 text-slate-400">
          การสกัดข้อมูลและข้อเสนอแนะทุกรายการจะแสดงเอกสารอ้างอิงและตำแหน่งในหลักฐาน โดยต้องผ่านการตรวจสอบและลงนามรับรองจากเจ้าหน้าที่ผู้รับผิดชอบก่อนบรรจุเข้าสำนวนคดี
        </p>
      </header>

      {mode === 'demo' && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">โหมดสาธิต: การตรวจทานจะจำลองผลเฉพาะในระบบทดสอบ</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">{success}</div>}
      {actionError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{actionError}</div>}

      <div className="rounded-3xl border border-slate-900 bg-slate-900/30 p-5">
        <label htmlFor="case-filter" className="text-xs font-semibold text-slate-300">เลือกสำนวนคดี</label>
        <select id="case-filter" value={selectedCaseId} onChange={(event) => { setSelectedCaseId(event.target.value); setAiInput((current) => ({ ...current, evidence_id: '' })); setManual((current) => ({ ...current, evidence_id: '' })); }} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white">
          <option value="">ทุกสำนวนคดีที่ได้รับสิทธิ์</option>
          {cases.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}
        </select>
      </div>

      <form onSubmit={createAiSuggestions} className="rounded-3xl border border-indigo-400/15 bg-indigo-400/[0.035] p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-300" />
          <h2 className="font-bold text-white">การสกัดข้อมูลอัตโนมัติด้วย AI จากเอกสารหลักฐาน</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          ระบบรองรับทั้ง OCR จากภาพ/PDF และการวิเคราะห์ข้อความที่เจ้าหน้าที่ระบุ โดยรับเฉพาะหลักฐานที่ผ่านการตรวจความปลอดภัย (CLEAN) และบันทึกผลเป็นข้อเสนอแนะ (SUGGESTED) เพื่อรอการอนุมัติ
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_150px]">
          <label className="text-xs text-slate-300">หลักฐานที่ปลอดภัย (CLEAN)<select required disabled={!selectedCaseId} value={aiInput.evidence_id} onChange={(event) => setAiInput((current) => ({ ...current, evidence_id: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"><option value="">เลือกไฟล์หลักฐาน</option>{cleanCaseEvidence.map((item) => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label>
          <label className="text-xs text-slate-300">หน้าเอกสาร<input required type="number" min="1" max="100000" value={aiInput.page_number} onChange={(event) => setAiInput((current) => ({ ...current, page_number: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300 md:col-span-2">ข้อความต้นทางในเอกสาร (ไม่บังคับ)<textarea maxLength={4000} rows={5} value={aiInput.source_text} onChange={(event) => setAiInput((current) => ({ ...current, source_text: event.target.value }))} placeholder="เว้นว่างเพื่อให้ระบบ OCR อ่านจากภาพหรือ PDF ที่เลือก" aria-describedby="ai-source-help" className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /><span id="ai-source-help" className="mt-1 block text-[10px] text-slate-600">เมื่อระบุข้อความ ระบบจะวิเคราะห์เฉพาะข้อความนั้น; เมื่อเว้นว่าง ระบบจะใช้ Vision OCR กับต้นฉบับ CLEAN</span></label>
        </div>
        {selectedCaseId && cleanCaseEvidence.length === 0 && <p role="status" className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-xs text-amber-200">คดีนี้ยังไม่มีหลักฐานที่ผ่านการตรวจความปลอดภัย (CLEAN)</p>}
        <button type="submit" disabled={submitting === 'ai' || !selectedCaseId || cleanCaseEvidence.length === 0} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-indigo-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50 cursor-pointer">{submitting === 'ai' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{mode === 'demo' ? 'ทดลอง OCR และสกัดข้อมูล' : 'สั่งการให้ AI วิเคราะห์สกัดข้อมูล'}</button>
      </form>

      <form onSubmit={createManualSuggestion} className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
        <div className="flex items-center gap-2">
          <Save className="h-5 w-5 text-teal-300" />
          <h2 className="font-bold text-white">การบันทึกข้อมูลพยานหลักฐานด้วยตนเอง (Manual Entry)</h2>
        </div>
        <p className="mt-2 text-xs text-slate-500">ใช้สำหรับบันทึกความเชื่อมโยงโดยตรงจากเอกสารต้นฉบับ</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs text-slate-300">ไฟล์หลักฐานอ้างอิง<select required disabled={!selectedCaseId} value={manual.evidence_id} onChange={(event) => setManual((current) => ({ ...current, evidence_id: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"><option value="">เลือกไฟล์หลักฐาน</option>{caseEvidence.map((item) => <option key={item.id} value={item.id}>{item.filename} · {evidenceSafetyLabel(item.malware_scan_status)}</option>)}</select></label>
          <label className="text-xs text-slate-300">หน้าเอกสาร<input required type="number" min="1" max="100000" value={manual.page_number} onChange={(event) => setManual((current) => ({ ...current, page_number: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300">ประเภทข้อมูล<select value={manual.entity_type} onChange={(event) => setManual((current) => ({ ...current, entity_type: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white">{entityTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="text-xs text-slate-300 md:col-span-2">ข้อความต้นทางในหลักฐาน<textarea required maxLength={4000} rows={3} value={manual.source_text} onChange={(event) => setManual((current) => ({ ...current, source_text: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300">ค่าข้อมูลที่ระบุ<input required maxLength={1000} value={manual.candidate_value} onChange={(event) => setManual((current) => ({ ...current, candidate_value: event.target.value }))} placeholder="เช่น ชื่อ-นามสกุล, เลขบัญชี, เบอร์โทร" className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
          <label className="text-xs text-slate-300 md:col-span-2 xl:col-span-3">เหตุผลและความเชื่อมโยง<textarea required maxLength={2000} rows={2} value={manual.reason} onChange={(event) => setManual((current) => ({ ...current, reason: event.target.value }))} placeholder="ระบุความเชื่อมโยงกับพฤติการณ์ในคดี..." className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" /></label>
        </div>
        <button type="submit" disabled={submitting === 'manual' || !selectedCaseId} className="mt-5 inline-flex items-center rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50 cursor-pointer">{submitting === 'manual' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}บันทึกข้อเสนอแนะข้อมูล</button>
      </form>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-900 text-sm text-slate-400" role="status">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดข้อมูลคิวตรวจทาน...
        </div>
      ) : loadError ? (
        <div className="rounded-3xl border border-rose-500/20 p-10 text-center" role="alert">
          <p className="text-sm text-rose-300">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center rounded-xl border border-rose-400/20 px-4 py-2 text-xs text-rose-200 cursor-pointer">
            <RefreshCw className="mr-2 h-4 w-4" />ลองใหม่อีกครั้ง
          </button>
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 py-20 text-center text-sm text-slate-500">
          ยังไม่มีรายการข้อเสนอแนะในสำนวนคดีที่เลือก
        </div>
      ) : (
        <div className="space-y-5">
          {visibleSuggestions.map((item) => {
            const source = evidence.find((record) => record.id === item.evidence_id);
            return (
              <article key={item.id} className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-indigo-300 font-semibold">{item.entity_type}</span>
                  <span className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300">{item.status}</span>
                  <span className="text-slate-500">{item.provider}{item.model ? ` / ${item.model}` : ''} · Schema {item.prompt_schema_version}</span>
                </div>
                <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-3">
                    <p className="text-lg font-bold text-white">{item.candidate_value}</p>
                    <p className="text-sm text-slate-400">เหตุผลความเชื่อมโยง: {item.reason}</p>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <p className="text-xs font-semibold text-teal-300">{source?.filename || item.evidence_id} · หน้า {item.page_number}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{item.source_text}</p>
                    </div>
                    <button type="button" onClick={() => void openEvidence(item)} className="inline-flex items-center text-xs font-semibold text-indigo-300 hover:text-indigo-200 cursor-pointer">
                      <ExternalLink className="mr-1 h-4 w-4" />เปิดดูเอกสารหลักฐานต้นฉบับ (Signed URL)
                    </button>
                  </div>
                  {item.status === 'SUGGESTED' ? (
                    <div className="space-y-3">
                      <label className="text-xs text-slate-300">แก้ไขค่าก่อนรับรอง (ถ้าจำเป็น)
                        <input value={editedValues[item.id] ?? item.candidate_value} onChange={(event) => setEditedValues((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" />
                      </label>
                      <label className="text-xs text-slate-300">เหตุผลการพิจารณาของผู้ตรวจทาน
                        <textarea rows={3} maxLength={2000} value={reviewReasons[item.id] || ''} onChange={(event) => setReviewReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="ระบุเหตุผลการรับรองหรือปฏิเสธ..." className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" />
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" disabled={submitting === item.id} onClick={() => void review(item, 'REJECTED')} className="flex items-center justify-center rounded-xl border border-rose-500/20 p-2 text-xs text-rose-300 hover:bg-rose-950/30 transition cursor-pointer">
                          <X className="mr-1 h-4 w-4" />ปฏิเสธ
                        </button>
                        <button type="button" disabled={submitting === item.id} onClick={() => void review(item, 'UNCERTAIN')} className="flex items-center justify-center rounded-xl border border-amber-500/20 p-2 text-xs text-amber-300 hover:bg-amber-950/30 transition cursor-pointer">
                          <ShieldAlert className="mr-1 h-4 w-4" />รอตรวจสอบ
                        </button>
                        <button
                          type="button"
                          disabled={submitting === item.id || !isEvidenceUsable(source?.upload_state, source?.malware_scan_status)}
                          onClick={() => setStepUpTarget({ item, decision: 'CONFIRMED' })}
                          className="flex items-center justify-center rounded-xl bg-teal-400 p-2 text-xs font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-50 transition shadow-[0_0_15px_rgba(45,212,191,0.2)] cursor-pointer"
                        >
                          {submitting === item.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-1 h-4 w-4" />}
                          ลงนามรับรอง
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/[0.06] p-4 text-sm text-slate-400">
                      <p className="font-semibold text-slate-300 mb-1">ผลการพิจารณาโดยเจ้าหน้าที่:</p>
                      <p>{item.review_reason || '-'}</p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Biometric Step-Up Modal */}
      {stepUpTarget && (
        <BiometricStepUpModal
          isOpen={Boolean(stepUpTarget)}
          onClose={() => setStepUpTarget(null)}
          title="ยืนยันการรับรองพยานหลักฐานด้วยชีวมิติ"
          reason={`ยืนยันค่า ${stepUpTarget.item.entity_type}: ${stepUpTarget.item.candidate_value} เข้าสู่ทะเบียนหลักฐานนิติวิทยาศาสตร์`}
          actionLabel="สแกนใบหน้า / ลายนิ้วมือเพื่อยืนยัน"
          onSuccess={() => {
            const target = stepUpTarget;
            setStepUpTarget(null);
            void review(target.item, target.decision);
          }}
        />
      )}
    </div>
  );
}
