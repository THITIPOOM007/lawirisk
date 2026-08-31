'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Settings, 
  Save, 
  FileText, 
  Loader2, 
  User, 
  MapPin, 
  Tag, 
  Key, 
  FileCheck, 
  CheckCircle2, 
  Code2,
  FolderKanban,
  Database,
  ExternalLink,
  Radar,
  RefreshCw,
  SearchCheck,
  Clock3
} from 'lucide-react';
import {
  type Case,
  type IntakeAttachment,
  type IntakeDuplicateCandidate,
  type IntakeEnvelope,
  type IntakeMessage,
  type IntakeParticipant,
  type IntakeSourceCheck,
} from '@/lib/demo-data';

import { validateFileInBrowser } from '@/lib/file-validator';

const OFFICIAL_SOURCE_URLS: Record<IntakeSourceCheck['source_key'], string> = {
  FDA_PUBLIC: 'https://porta.fda.moph.go.th/fda_search_center_new/',
  HSS_PUBLIC_CLINIC: 'https://privatehospital.hss.moph.go.th/s_view_hospital.php',
  HSS_PUBLIC_HEALTH_BUSINESS: 'https://spa-services.hss.moph.go.th/permit/spa/establishment',
};

export default function IntakeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const intakeId = params.id as string;

  const [envelope, setEnvelope] = useState<IntakeEnvelope | null>(null);
  const [message, setMessage] = useState<IntakeMessage | null>(null);
  const [participants, setParticipants] = useState<IntakeParticipant[]>([]);
  const [attachments, setAttachments] = useState<IntakeAttachment[]>([]);
  const [duplicates, setDuplicates] = useState<IntakeDuplicateCandidate[]>([]);
  const [sourceChecks, setSourceChecks] = useState<IntakeSourceCheck[]>([]);
  const [casesList, setCasesList] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Attachment upload states
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Triage form states
  const [triageAction, setTriageAction] = useState<'CREATE_CASE' | 'MERGE_INTAKE' | 'REQUEST_MORE_INFO' | 'REJECT_SPAM'>('CREATE_CASE');
  const [triageReason, setTriageReason] = useState('');
  const [mergeCaseId, setMergeCaseId] = useState('');
  
  // New Case form states
  const caseSequence = 100 + [...intakeId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 900;
  const [newCaseNumber, setNewCaseNumber] = useState(`ค.${caseSequence}/2569`);
  const [newCaseTitle, setNewCaseTitle] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);
  const [isRefreshingChecks, setIsRefreshingChecks] = useState(false);
  const [checksMessage, setChecksMessage] = useState('');
  const [checksError, setChecksError] = useState('');
  const [canRefreshSourceChecks, setCanRefreshSourceChecks] = useState(false);

  // Parse structured payload if the message contains JSON
  const parsedData = useMemo(() => {
    if (!message?.raw_payload) return null;
    try {
      const obj = JSON.parse(message.raw_payload);
      if (typeof obj === 'object' && obj !== null) {
        return obj as {
          trackingToken?: string;
          topic?: string;
          description?: string;
          category?: string;
          region?: string;
          complainantName?: string;
          complainantContact?: string;
          source?: string;
          [key: string]: unknown;
        };
      }
    } catch {
      // not JSON
    }
    return null;
  }, [message]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (files.length > 5) {
      setUploadError('เลือกไฟล์ได้สูงสุด 5 รายการต่อครั้ง');
      input.value = '';
      return;
    }

    setIsUploadingFile(true);
    setUploadError('');
    setUploadStatus(`กำลังตรวจสอบไฟล์ 1/${files.length}...`);

    try {
      for (let index = 0; index < files.length; index += 1) {
        const validation = await validateFileInBrowser(files[index]);
        if (!validation.isValid) {
          throw new Error(`${files[index].name}: ${validation.error || 'ไฟล์ไม่ผ่านเกณฑ์ความปลอดภัย'}`);
        }
      }

      const uploaded: IntakeAttachment[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadStatus(`กำลังจัดเก็บไฟล์ ${index + 1}/${files.length}: ${file.name}`);
        const formData = new FormData();
        formData.set('file', file);
        const res = await fetch(`/api/v1/intake/${encodeURIComponent(intakeId)}/attachments`, {
          method: 'POST',
          credentials: 'same-origin',
          body: formData,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${body.error?.message || 'อัปโหลดไฟล์แนบไม่สำเร็จ'}`);
        if (body.data) uploaded.push(body.data as IntakeAttachment);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
      setUploadStatus(`จัดเก็บครบ ${uploaded.length} ไฟล์แล้ว`);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอัปโหลด');
    } finally {
      setIsUploadingFile(false);
      window.setTimeout(() => setUploadStatus(''), 2_500);
      input.value = '';
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/intake/${encodeURIComponent(intakeId)}`, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดรายละเอียดคำร้องไม่สำเร็จ');
        const nextEnvelope = body.data.envelope as IntakeEnvelope;
        const nextMessage = body.data.message as IntakeMessage | null;
        setEnvelope(nextEnvelope);
        setMessage(nextMessage);
        setNewCaseTitle((current) => {
          if (current) return current;
          if (nextMessage?.raw_payload) {
            try {
              const payload = JSON.parse(nextMessage.raw_payload) as { topic?: unknown };
              if (typeof payload.topic === 'string' && payload.topic.trim()) return payload.topic.trim();
            } catch {
              // Plain-text intake messages use the envelope reason below.
            }
          }
          return nextEnvelope.urgency_reason || '';
        });
        setParticipants(body.data.participants as IntakeParticipant[]);
        setAttachments(body.data.attachments as IntakeAttachment[]);
        setDuplicates(body.data.duplicates as IntakeDuplicateCandidate[]);
        setSourceChecks((body.data.sourceChecks || []) as IntakeSourceCheck[]);
        setCasesList(body.data.cases as Case[]);
        setCanRefreshSourceChecks(Boolean(body.data.capabilities?.canRefreshSourceChecks));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'โหลดรายละเอียดคำร้องไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [intakeId]);

  const handleRefreshChecks = async () => {
    setIsRefreshingChecks(true);
    setChecksError('');
    setChecksMessage('');
    try {
      const response = await fetch(`/api/v1/intake/${encodeURIComponent(intakeId)}/enrichment`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'ตรวจฐานข้อมูลทางการไม่สำเร็จ');
      const detailResponse = await fetch(`/api/v1/intake/${encodeURIComponent(intakeId)}`, { credentials: 'same-origin' });
      const detailBody = await detailResponse.json();
      if (!detailResponse.ok) throw new Error(detailBody.error?.message || 'โหลดผลตรวจล่าสุดไม่สำเร็จ');
      setSourceChecks((detailBody.data.sourceChecks || []) as IntakeSourceCheck[]);
      setChecksMessage(body.data?.checks?.length
        ? 'ตรวจฐานข้อมูลทางการและอัปเดตผลล่าสุดให้เจ้าหน้าที่แล้ว'
        : 'คำร้องนี้ยังไม่มีคำค้นที่ปลอดภัยและตรงประเภทเพียงพอสำหรับค้นอัตโนมัติ');
    } catch (error: unknown) {
      setChecksError(error instanceof Error ? error.message : 'ตรวจฐานข้อมูลทางการไม่สำเร็จ');
    } finally {
      setIsRefreshingChecks(false);
    }
  };

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envelope) return;

    setIsSubmitting(true);
    setSuccessMessage('');
    setSubmitError('');
    try {
      const response = await fetch(`/api/v1/intake/${encodeURIComponent(envelope.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: triageAction,
          reason: triageReason,
          destination_case_id: triageAction === 'MERGE_INTAKE' ? mergeCaseId : undefined,
          new_case_number: triageAction === 'CREATE_CASE' ? newCaseNumber : undefined,
          new_case_title: triageAction === 'CREATE_CASE' ? newCaseTitle : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกผลคัดกรองไม่สำเร็จ');
      setSuccessMessage('บันทึกผลการคัดกรองและประวัติการตรวจสอบ (Audit Log) เรียบร้อยแล้ว');
      window.setTimeout(() => router.push('/intake'), 900);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'บันทึกผลคัดกรองไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !envelope) {
    return <div className="flex items-center justify-center p-16 text-slate-400 text-sm" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin text-teal-300" />กำลังโหลดข้อมูลรายละเอียดคำร้องและพยานหลักฐาน...</div>;
  }
  if (loadError || !envelope) {
    return <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-rose-300 text-center" role="alert">{loadError || 'ไม่พบรายการคำร้อง'}</div>;
  }

  const complainant = participants.find(p => p.role === 'COMPLAINANT');
  const accused = participants.find(p => p.role === 'ACCUSED');
  const isAlreadyTriaged = envelope.status === 'PROMOTED' || envelope.status === 'MERGED' || envelope.status === 'REJECTED';

  return (
    <div className="space-y-8">
      {/* Navigation breadcrumb & Title */}
      <div>
        <Link href="/intake" className="inline-flex items-center text-xs text-indigo-400 hover:text-indigo-300 font-semibold mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" /> กลับสู่ระบบรับเรื่องและคัดกรองเบาะแส
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center space-x-3">
            <FileText className="h-7 w-7 text-teal-300 shrink-0" />
            <span>รายละเอียดคำร้องและเบาะแส #{envelope.id.slice(0, 8)}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${
              envelope.status === 'PROMOTED'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : envelope.status === 'MERGED'
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                : envelope.status === 'REJECTED'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : envelope.status === 'NEEDS_INFO'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : envelope.status === 'QUARANTINED'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
            }`}>
              สถานะ: {
                envelope.status === 'PROMOTED' ? 'ยกระดับเป็นคดีแล้ว (PROMOTED)' :
                envelope.status === 'MERGED' ? 'ผนวกเข้าสำนวนเดิม (MERGED)' :
                envelope.status === 'REJECTED' ? 'ปฏิเสธคำร้อง (REJECTED)' :
                envelope.status === 'NEEDS_INFO' ? 'รอข้อมูลเพิ่มเติม (NEEDS_INFO)' :
                envelope.status === 'QUARANTINED' ? 'ระงับชั่วคราว (QUARANTINED)' :
                'รอการคัดกรอง (TRIAGE_PENDING)'
              }
            </span>
            {parsedData?.trackingToken && (
              <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-500/30 px-3.5 py-1.5 rounded-full text-xs font-mono text-indigo-300">
                <Key className="h-3.5 w-3.5" />
                <span>รหัสติดตาม: {parsedData.trackingToken}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-2xl text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {submitError && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300" role="alert">{submitError}</div>}

      <section className="relative overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(8,47,73,.42),rgba(2,6,23,.82)_52%,rgba(49,46,129,.18))] p-5 shadow-[0_24px_80px_rgba(8,145,178,.08)] sm:p-7" aria-labelledby="preliminary-search-heading">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border border-cyan-300/10 bg-cyan-300/[0.03]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200"><Radar className="h-6 w-6" /></div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">Automatic preliminary intelligence</p>
              <h2 id="preliminary-search-heading" className="mt-1 text-lg font-black text-white sm:text-xl">ผลสืบค้นเบื้องต้นจากฐานข้อมูลทางการ</h2>
              <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-400">ระบบแยกเลขหรือคำค้นจากเรื่องร้องเรียน แล้วส่งไปยังฐานที่ตรงประเภทเท่านั้น ผลทั้งหมดเป็น “ข้อเสนอ” พร้อมแหล่งอ้างอิง ยังไม่ถือเป็นข้อเท็จจริงที่เจ้าหน้าที่รับรอง</p>
            </div>
          </div>
          {canRefreshSourceChecks ? <button type="button" onClick={handleRefreshChecks} disabled={isRefreshingChecks} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300 px-4 text-xs font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingChecks ? 'animate-spin' : ''}`} />{isRefreshingChecks ? 'กำลังตรวจต้นทาง…' : 'ตรวจฐานทางการอีกครั้ง'}
          </button> : <span className="inline-flex min-h-10 items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-[10px] font-bold text-slate-500">สิทธิ์ดูผลเท่านั้น</span>}
        </div>
        {checksMessage && <p role="status" aria-live="polite" className="relative mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs text-emerald-200">{checksMessage}</p>}
        {checksError && <p role="alert" className="relative mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-xs text-rose-200">{checksError}</p>}
        <div className="relative mt-5 grid gap-4 xl:grid-cols-2">
          {sourceChecks.length > 0 ? sourceChecks.map((check) => (
            <article key={check.id} className="rounded-3xl border border-white/[0.08] bg-slate-950/55 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${check.status === 'FOUND' ? 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-300' : check.status === 'UNAVAILABLE' ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200' : 'border-slate-300/15 bg-slate-300/[0.05] text-slate-300'}`}>{check.status === 'FOUND' ? `พบ ${check.result_count} รายการ` : check.status === 'UNAVAILABLE' ? 'ต้นทางไม่พร้อม' : 'ยังไม่พบรายการตรงกัน'}</span>
                  <span className="rounded-full border border-indigo-300/20 bg-indigo-300/[0.06] px-2.5 py-1 text-[10px] font-bold text-indigo-200">SUGGESTED · รอตรวจทาน</span>
                </div>
                <span className="inline-flex items-center text-[10px] text-slate-500"><Clock3 className="mr-1 h-3 w-3" />{new Date(check.checked_at).toLocaleString('th-TH')}</span>
              </div>
              <h3 className="mt-4 text-sm font-black text-white">{check.source_label}</h3>
              <div className="mt-2 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] px-3 py-2 text-xs text-cyan-100"><span className="text-cyan-300/60">คำค้นที่ส่ง:</span> <span className="font-mono font-bold">{check.query_text}</span></div>
              <p className="mt-3 text-xs leading-6 text-slate-300">{check.summary}</p>
              <p className="mt-2 text-[10px] leading-5 text-slate-500">เหตุผลเลือกฐาน: {check.routing_reason}</p>
              {check.results.filter((result) => ['SAFE', 'WARNING', 'REVOKED'].includes(result.status)).slice(0, 3).map((result) => (
                <div key={result.id} className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="flex items-start gap-2"><SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><p className="text-xs font-bold text-white">{result.title}</p><p className="mt-1 text-[10px] leading-5 text-slate-400">{result.snippet}</p></div></div>
                </div>
              ))}
              <a href={OFFICIAL_SOURCE_URLS[check.source_key]} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-9 items-center text-xs font-bold text-cyan-300 hover:text-cyan-200">เปิดฐานข้อมูลต้นฉบับ <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
            </article>
          )) : (
            <div className="xl:col-span-2 rounded-3xl border border-dashed border-white/[0.1] bg-slate-950/35 p-6 text-center">
              <Database className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-bold text-slate-300">ยังไม่มีผลสืบค้นเบื้องต้นสำหรับคำร้องนี้</p><p className="mt-1 text-xs text-slate-500">กด “ตรวจฐานทางการอีกครั้ง” เพื่อให้ระบบจำแนกเรื่องและเลือกฐานข้อมูลที่ตรงประเภท</p>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Left column: Original payload and details (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 sm:p-7 space-y-6">
            <h3 className="text-base font-bold text-white flex items-center pb-3 border-b border-white/[0.08]">
              <FileCheck className="h-5 w-5 mr-2 text-teal-300" />
              ข้อมูลคำร้องและพยานหลักฐานนำเข้า (Evidence Payload)
            </h3>

            {/* Structured Topic & Description */}
            {parsedData?.topic && (
              <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-teal-300 shrink-0" />
                  <h4 className="text-xs font-bold text-teal-200 uppercase tracking-wide">หัวข้อเรื่องร้องเรียน</h4>
                </div>
                <p className="text-sm font-bold text-white leading-relaxed">
                  {parsedData.topic}
                </p>
                {parsedData.description && (
                  <div className="pt-2 border-t border-slate-900 space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 block">พฤติการณ์ / สรุปสาระสำคัญ:</span>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {parsedData.description}
                    </p>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-3 text-xs">
                  {parsedData.category && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-300 text-[11px]">
                      <Tag className="h-3 w-3" />
                      <span>หมวดหมู่: {parsedData.category}</span>
                    </div>
                  )}
                  {parsedData.region && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-300 text-[11px]">
                      <MapPin className="h-3 w-3" />
                      <span>พื้นที่: {parsedData.region}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Complainant metadata Box */}
            <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-400" />
                ข้อมูลผู้แจ้งเรื่องร้องเรียน / เบาะแส (Complainant)
              </h4>
              {envelope.complainant_mode === 'ANONYMOUS' ? (
                <div className="p-3.5 bg-amber-950/20 rounded-xl text-xs text-amber-300 border border-amber-800/40">
                  <span className="font-bold">⚠️ ผู้ร้องเรียนเลือก &quot;ไม่ระบุตัวตน&quot; (Anonymous Mode)</span>
                  <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                    ระบบได้แยกการจัดเก็บข้อมูลและไม่บันทึกชื่อหรือเบอร์ติดต่อ เพื่อคุ้มครองความปลอดภัยสูงสุดของผู้แจ้งเบาะแส
                  </p>
                </div>
              ) : complainant ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">ชื่อ-นามสกุล / หน่วยงาน:</span>
                    <span className="text-white font-semibold">{complainant.name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">เบอร์โทรศัพท์ติดต่อ:</span>
                    <span className="text-white font-semibold font-mono">{complainant.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">อีเมล:</span>
                    <span className="text-white font-semibold">{complainant.email || '-'}</span>
                  </div>
                </div>
              ) : parsedData?.complainantName || parsedData?.complainantContact ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">ชื่อผู้แจ้ง:</span>
                    <span className="text-white font-semibold">{parsedData.complainantName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">ช่องทางติดต่อ:</span>
                    <span className="text-white font-semibold font-mono">{parsedData.complainantContact || '-'}</span>
                  </div>
                </div>
              ) : (
                <span className="text-slate-500 text-xs italic">ไม่ระบุข้อมูลการติดต่อส่วนบุคคล</span>
              )}
            </div>

            {/* Accused metadata Box */}
            <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                ข้อมูลผู้ถูกกล่าวหา / เป้าหมายเบาะแส (Accused Entity)
              </h4>
              {accused ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">ชื่อบุคคล/เพจ/ห้างร้าน:</span>
                    <span className="text-white font-semibold">{accused.name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">เบอร์ติดต่อที่ระบุ:</span>
                    <span className="text-white font-semibold font-mono">{accused.phone || '-'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-[11px]">ที่อยู่ / พิกัดสถานที่เกิดเหตุ:</span>
                    <span className="text-white font-semibold">{accused.address || '-'}</span>
                  </div>
                </div>
              ) : (
                <span className="text-slate-500 text-xs italic">ระบุในรายละเอียดพฤติการณ์ของเรื่องร้องเรียน</span>
              )}
            </div>

            {/* Raw Message Box (Collapsible) */}
            <div className="space-y-2">
              <button 
                type="button" 
                onClick={() => setShowRawJson(!showRawJson)} 
                className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Code2 className="h-3.5 w-3.5 text-indigo-400" />
                <span>{showRawJson ? 'ซ่อนข้อมูลดิบ (Hide Raw Payload)' : 'ดูข้อมูลดิบ (View Raw JSON Payload)'}</span>
              </button>
              {showRawJson && (
                <pre className="p-4 bg-slate-950 border border-slate-900/80 rounded-2xl text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {message?.raw_payload || 'ไม่มีข้อมูลนำเข้า'}
                </pre>
              )}
            </div>

            {/* Attachments Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">เอกสารและพยานหลักฐานที่แนบมา ({attachments.length})</span>
              </div>

              {/* Upload Dropzone / Form */}
              <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">แนบไฟล์พยานหลักฐานเพิ่มเติม</span>
                  <span className="text-[10px] text-slate-500">เลือกพร้อมกันได้สูงสุด 5 ไฟล์ · ไฟล์ละไม่เกิน 20 MB</span>
                </div>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  disabled={isUploadingFile}
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer disabled:opacity-50"
                />
                {uploadStatus && (
                  <p className="text-xs text-indigo-300 flex items-center">
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {uploadStatus}
                  </p>
                )}
                {uploadError && (
                  <p className="text-xs text-rose-400 flex items-center">
                    <ShieldAlert className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    {uploadError}
                  </p>
                )}
              </div>

              {attachments.length > 0 ? (
                <div className="space-y-3">
                  {attachments.map(att => (
                    <div key={att.id} className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl flex items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{att.filename}</p>
                        <span className="text-[10px] text-slate-500 block truncate">ขนาด: {(att.file_size / (1024 * 1024)).toFixed(2)} MB | SHA-256: {att.sha256.substring(0, 16)}...</span>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {att.upload_state && att.upload_state !== 'STORED' ? (
                          <span className="inline-flex items-center px-2.5 py-1 border border-amber-500/35 bg-amber-500/10 text-amber-300 rounded-xl text-[10px] font-semibold">
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ไฟล์ยังบันทึกไม่สมบูรณ์
                          </span>
                        ) : att.malware_scan_status === 'INFECTED' ? (
                          <span className="inline-flex items-center px-2.5 py-1 border border-rose-500/35 bg-rose-500/10 text-rose-400 rounded-xl text-[10px] font-semibold animate-pulse">
                            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                            ไฟล์ไม่ปลอดภัย
                          </span>
                        ) : att.malware_scan_status === 'CLEAN' ? (
                          <span className="inline-flex items-center px-2.5 py-1 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 rounded-xl text-[10px] font-semibold">
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            สแกนแล้ว (เดิม)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 rounded-xl text-[10px] font-semibold">
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            ตรวจรูปแบบไฟล์แล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-slate-500 text-xs italic block">ไม่มีไฟล์แนบพยานหลักฐาน</span>
              )}
            </div>

          </div>

        </div>

        {/* Right column: Duplicate checks and Triage decision form (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Duplicate warnings panel */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-amber-400" />
              การวิเคราะห์เรื่องซ้ำซ้อนโดยระบบ
            </h3>

            {duplicates.length > 0 ? (
              <div className="space-y-3">
                {duplicates.map(dup => {
                  const targetCase = casesList.find(c => c.id === dup.target_case_id);
                  return (
                    <div key={dup.id} className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-400">พบสำนวนคดีที่มีความสอดคล้อง ({Math.floor(dup.duplicate_score * 100)}%)</span>
                      </div>
                      <p className="text-slate-300 font-medium">
                        สำนวนคดีเดิม: {targetCase ? `${targetCase.number} - ${targetCase.title}` : 'สำนวนคดีที่เกี่ยวข้อง'}
                      </p>
                      <div className="pt-2 border-t border-amber-900/30 flex flex-wrap gap-2 text-[10px] text-slate-400">
                        {dup.matching_signals.phone && <span className="bg-slate-900 px-2 py-0.5 rounded">เบอร์โทรศัพท์ตรงกัน</span>}
                        {dup.matching_signals.name_similarity && <span className="bg-slate-900 px-2 py-0.5 rounded">ชื่อเป้าหมายคล้ายคลึงกัน</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed italic">
                        **นโยบายความถูกต้อง:** ระบบไม่อนุญาตให้รวมสำนวนคดีโดยอัตโนมัติ เจ้าหน้าที่ต้องตรวจสอบและตัดสินใจด้วยตนเองเท่านั้น
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl text-center py-6">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="mt-2 text-xs text-slate-400">ไม่พบคำร้องที่ซ้ำซ้อนในสำนวนคดีอื่น</p>
              </div>
            )}
          </div>

          {/* Triage action workspace */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <h3 className="text-base font-bold text-white flex items-center">
              <Settings className="h-5 w-5 mr-2 text-indigo-400" />
              การพิจารณาและสั่งการคัดกรอง
            </h3>

            {isAlreadyTriaged ? (
              <div className="space-y-4">
                <div className={`p-5 rounded-2xl border ${
                  envelope.status === 'PROMOTED'
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : envelope.status === 'MERGED'
                    ? 'bg-sky-950/30 border-sky-500/30 text-sky-300'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
                    <div className="space-y-1 text-xs">
                      <h4 className="font-bold text-sm text-white">
                        {envelope.status === 'PROMOTED' ? 'คำร้องนี้ได้รับการอนุมัติเปิดสำนวนคดีแล้ว' :
                         envelope.status === 'MERGED' ? 'คำร้องนี้ถูกผนวกเข้ากับสำนวนคดีเดิมแล้ว' :
                         'คำร้องนี้ถูกปฏิเสธ / สแปม'}
                      </h4>
                      <p className="leading-relaxed text-slate-300">
                        {envelope.status === 'PROMOTED'
                          ? 'ซองคำร้องและพยานหลักฐานได้รับการบรรจุเข้าสู่สารบบคดีสืบสวนเรียบร้อยแล้ว คุณสามารถจัดการงานสืบสวนต่อได้ที่หน้าสำนวนคดี'
                          : envelope.status === 'MERGED'
                          ? 'ข้อมูลและหลักฐานในซองนี้ถูกโอนย้ายไปยังสำนวนคดีเป้าหมายเรียบร้อยแล้ว'
                          : 'คำร้องนี้ถูกบันทึกเป็นสแปมหรืออยู่นอกอำนาจหน้าที่ตามผลการพิจารณา'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Link
                    href="/cases"
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md"
                  >
                    <FolderKanban className="h-4 w-4" />
                    <span>ไปยังรายการสำนวนคดีสืบสวน (Case Space)</span>
                  </Link>
                  <Link
                    href="/evidence"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 bg-slate-950 hover:bg-slate-900 border border-slate-800 transition-all"
                  >
                    <Database className="h-4 w-4 text-teal-300" />
                    <span>เปิดคลังพยานหลักฐานดิจิทัล (Evidence Vault)</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleTriageSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-2">เลือกผลการพิจารณาคัดกรอง</label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="triage_action"
                        checked={triageAction === 'CREATE_CASE'}
                        onChange={() => setTriageAction('CREATE_CASE')}
                        className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                      />
                      <div>
                        <span className="font-bold text-white block">อนุมัติเปิดสำนวนคดีใหม่ (CREATE_CASE)</span>
                        <span className="text-[10px] text-slate-500">ขึ้นทะเบียนเป็นสำนวนคดีสืบสวนใหม่ของหน่วยงาน</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="triage_action"
                        checked={triageAction === 'MERGE_INTAKE'}
                        onChange={() => setTriageAction('MERGE_INTAKE')}
                        className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                      />
                      <div>
                        <span className="font-bold text-white block">ผนวกเข้ากับสำนวนคดีเดิม (MERGE_INTAKE)</span>
                        <span className="text-[10px] text-slate-500">นำข้อมูลและพยานหลักฐานรวมเข้ากับสำนวนคดีที่มีอยู่แล้ว</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="triage_action"
                        checked={triageAction === 'REQUEST_MORE_INFO'}
                        onChange={() => setTriageAction('REQUEST_MORE_INFO')}
                        className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                      />
                      <div>
                        <span className="font-bold text-white block">ขอข้อมูลและพยานหลักฐานเพิ่มเติม (REQUEST_MORE_INFO)</span>
                        <span className="text-[10px] text-slate-500">ประสานงานผู้ร้องเรียนเพื่อขอรายละเอียดเอกสารเพิ่มเติม</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="triage_action"
                        checked={triageAction === 'REJECT_SPAM'}
                        onChange={() => setTriageAction('REJECT_SPAM')}
                        className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                      />
                      <div>
                        <span className="font-bold text-white block">ปฏิเสธคำร้อง / ไม่เข้าข่าย (REJECT_SPAM)</span>
                        <span className="text-[10px] text-slate-500">กรณีข้อมูลเท็จ สแปม หรือไม่อยู่ในขอบข่ายอำนาจหน้าที่</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Dynamic input sections */}
                {triageAction === 'CREATE_CASE' && (
                  <div className="space-y-3 p-4 bg-slate-950 border border-slate-900 rounded-2xl">
                    <h4 className="font-bold text-white block mb-1">ระบุรายละเอียดสำนวนคดีใหม่</h4>
                    <div>
                      <label className="text-slate-400 block mb-1">เลขที่สำนวนคดี</label>
                      <input
                        type="text"
                        required
                        value={newCaseNumber}
                        onChange={(e) => setNewCaseNumber(e.target.value)}
                        className="w-full bg-slate-900 border-0 rounded-xl py-2 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">ชื่อสำนวนคดีสืบสวน</label>
                      <input
                        type="text"
                        required
                        placeholder="เช่น คดีบริการจัดฟันแฟชั่นผิดกฎหมาย Sisaket"
                        value={newCaseTitle}
                        onChange={(e) => setNewCaseTitle(e.target.value)}
                        className="w-full bg-slate-900 border-0 rounded-xl py-2 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                )}

                {triageAction === 'MERGE_INTAKE' && (
                  <div className="space-y-3 p-4 bg-slate-950 border border-slate-900 rounded-2xl">
                    <h4 className="font-bold text-white block mb-1">เลือกสำนวนคดีเดิมเป้าหมาย</h4>
                    <select
                      required
                      value={mergeCaseId}
                      onChange={(e) => setMergeCaseId(e.target.value)}
                      className="w-full bg-slate-900 border-0 rounded-xl py-2.5 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                    >
                      <option value="">-- กรุณาเลือกสำนวนคดีเดิม --</option>
                      {casesList.map(c => (
                        <option key={c.id} value={c.id}>{c.number} - {c.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">บันทึกความเห็นของเจ้าหน้าที่ผู้คัดกรอง</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="ระบุเหตุผลการพิจารณาคัดกรอง และข้อสั่งการประกอบ..."
                    value={triageReason}
                    onChange={(e) => setTriageReason(e.target.value)}
                    className="w-full bg-slate-950 border-0 rounded-2xl py-3 px-4 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || (triageAction === 'MERGE_INTAKE' && !mergeCaseId)}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      กำลังบันทึกและส่งต่อสำนวนคดี...
                    </>
                  ) : (
                    <>
                      <Save className="h-5 w-5 mr-2" />
                      บันทึกผลการพิจารณาคัดกรอง
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
