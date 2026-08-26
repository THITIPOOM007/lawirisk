'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  Lock,
  Unlock,
  Loader2,
  Scale,
  ShieldAlert,
  Sparkles,
  Users,
  UserPlus,
  Trash2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import type { Case, EvidenceFile } from '@/lib/demo-data';
import { evidenceSafetyLabel, isEvidenceUsable } from '@/lib/evidence-file-status';
import { CaseIntelligenceReconWidget } from '@/components/CaseIntelligenceReconWidget';

type CaseMember = {
  id: string;
  case_id: string;
  profile_id: string;
  role: 'OWNER' | 'MEMBER';
  created_at: string;
  profile?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

const CLOSURE_GATE_LABELS: Record<string, string> = {
  EVIDENCE_NOT_READY: 'ไฟล์หลักฐานทั้งหมดต้องจัดเก็บและตรวจรูปแบบไฟล์ให้สมบูรณ์',
  PENDING_SUGGESTIONS: 'ต้องไม่มีข้อเสนอ Entity ที่รอการตรวจทาน (SUGGESTED)',
  PENDING_MATCHES: 'ต้องไม่มีความเชื่อมโยงข้ามคดีที่รอการตรวจสอบ (PENDING)',
  ACTIVE_AUTOMATION: 'ต้องไม่มีงานดึงข้อความอัตโนมัติที่กำลังทำงานอยู่ (QUEUED/DISPATCHED/RUNNING)',
  NO_SUMMARY_REPORT: 'ต้องมีรายงานสรุปคดี (SUMMARY report) พร้อม Snapshot ที่สมบูรณ์อย่างน้อย 1 ฉบับ',
};

export default function CaseDetailsPage() {
  const params = useParams<{ id: string }>();
  const caseId = params.id;
  const [caseRecord, setCaseRecord] = useState<Case | null>(null);
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [members, setMembers] = useState<CaseMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  // Closure state
  const [isClosing, setIsClosing] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closureBlockers, setClosureBlockers] = useState<string[]>([]);
  const [closureMessage, setClosureMessage] = useState('');

  // Reopen state
  const [isReopening, setIsReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);

  // Investigation tasks state
  const [tasks, setTasks] = useState<{ id: string; title: string; description: string; priority: string; status: string }[]>([]);

  // Add member state
  const [newMemberProfileId, setNewMemberProfileId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'OWNER' | 'MEMBER'>('MEMBER');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/v1/cases/${encodeURIComponent(caseId)}`, { credentials: 'same-origin', signal: controller.signal }),
      fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, { credentials: 'same-origin', signal: controller.signal }),
      fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/tasks`, { credentials: 'same-origin', signal: controller.signal }),
    ])
      .then(async ([caseRes, membersRes, tasksRes]) => {
        const caseBody = await caseRes.json();
        if (!caseRes.ok) throw new Error(caseBody.error?.message || 'โหลดรายละเอียดสำนวนคดีไม่สำเร็จ');
        setCaseRecord(caseBody.data.case as Case);
        setEvidence(caseBody.data.evidence as EvidenceFile[]);

        if (membersRes.ok) {
          const membersBody = await membersRes.json();
          setMembers(membersBody.data as CaseMember[]);
        }

        if (tasksRes.ok) {
          const tasksBody = await tasksRes.json();
          setTasks((tasksBody.data as { id: string; title: string; description: string; priority: string; status: string }[]) || []);
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดสำนวนคดีไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [caseId]);

  const download = async (item: EvidenceFile) => {
    setDownloadingId(item.id);
    setDownloadError('');
    try {
      const response = await fetch(`/api/v1/evidence/${encodeURIComponent(item.id)}/download`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ');
      window.location.assign(body.data.url as string);
    } catch (caught: unknown) {
      setDownloadError(caught instanceof Error ? caught.message : 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setDownloadingId('');
    }
  };

  const handleCloseCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsClosing(true);
    setClosureBlockers([]);
    setClosureMessage('');
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: 'CLOSED', reason: closeReason || 'ปิดสำนวนคดีตามขั้นตอนตรวจสอบครบถ้วน' }),
      });
      const body = await res.json();
      if (res.status === 409 && body.error?.blockers) {
        setClosureBlockers(body.error.blockers as string[]);
        setClosureMessage(body.error.message || 'ไม่สามารถปิดคดีได้เนื่องจากมีขั้นตอนที่ยังไม่ผ่านเกณฑ์');
        return;
      }
      if (!res.ok) throw new Error(body.error?.message || 'ปิดสำนวนคดีไม่สำเร็จ');
      setShowCloseModal(false);
      setCaseRecord((prev) => (prev ? { ...prev, status: 'CLOSED' } : null));
    } catch (err: unknown) {
      setClosureMessage(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการปิดคดี');
    } finally {
      setIsClosing(false);
    }
  };

  const handleReopenCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReopening(true);
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: 'ACTIVE', reason: reopenReason || 'เปิดสำนวนคดีใหม่เพื่อสืบสวนเพิ่มเติม' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || 'เปิดสำนวนคดีใหม่ไม่สำเร็จ');
      setShowReopenModal(false);
      setCaseRecord((prev) => (prev ? { ...prev, status: 'ACTIVE' } : null));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเปิดสำนวนคดี');
    } finally {
      setIsReopening(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberProfileId.trim()) return;
    setIsAddingMember(true);
    setMemberActionError('');
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ profile_id: newMemberProfileId.trim(), role: newMemberRole }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || 'เพิ่มสมาชิกไม่สำเร็จ');
      setNewMemberProfileId('');
      // Refresh members
      const refreshed = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, { credentials: 'same-origin' });
      if (refreshed.ok) {
        const refBody = await refreshed.json();
        setMembers(refBody.data as CaseMember[]);
      }
    } catch (err: unknown) {
      setMemberActionError(err instanceof Error ? err.message : 'เพิ่มสมาชิกไม่สำเร็จ');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!confirm('ต้องการนำสมาชิกรายนี้ออกจากสำนวนหรือไม่?')) return;
    setMemberActionError('');
    try {
      const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ profile_id: profileId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || 'ลบสมาชิกไม่สำเร็จ');
      setMembers((prev) => prev.filter((m) => m.profile_id !== profileId));
    } catch (err: unknown) {
      setMemberActionError(err instanceof Error ? err.message : 'ลบสมาชิกไม่สำเร็จ');
    }
  };

  if (isLoading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดสำนวน...</div>;
  if (error || !caseRecord) return <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-rose-300">{error || 'ไม่พบสำนวนคดี'}</div>;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/cases" className="inline-flex items-center text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />กลับทะเบียนคดี
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 font-mono text-xs text-indigo-300">{caseRecord.number}</span>
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${caseRecord.status === 'ACTIVE' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>
                {caseRecord.status}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">{caseRecord.title}</h1>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-slate-400">{caseRecord.description || 'ไม่มีรายละเอียดคดี'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/review?case=${encodeURIComponent(caseId)}`} className="inline-flex items-center rounded-xl border border-amber-400/20 px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10">
              <Sparkles className="mr-2 h-4 w-4" />ตรวจข้อเสนอ
            </Link>
            <Link href={`/reports?case=${encodeURIComponent(caseId)}`} className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500">
              <Scale className="mr-2 h-4 w-4" />สร้างรายงาน
            </Link>
            {caseRecord.status === 'ACTIVE' ? (
              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                className="inline-flex items-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
              >
                <Lock className="mr-2 h-4 w-4" />ปิดสำนวนคดี
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowReopenModal(true)}
                className="inline-flex items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
              >
                <Unlock className="mr-2 h-4 w-4" />เปิดสำนวนใหม่
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Case Metrics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['หน่วยงาน', caseRecord.jurisdiction_agency || '-'],
          ['พื้นที่', caseRecord.jurisdiction_region || '-'],
          ['สร้างเมื่อ', new Date(caseRecord.created_at).toLocaleString('th-TH')],
          ['หลักฐานที่เข้าถึง', `${evidence.length} ไฟล์`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-900 bg-slate-900/30 p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-600">{label}</p>
            <p className="mt-2 text-sm font-semibold text-slate-200">{value}</p>
          </div>
        ))}
      </section>

      {/* Closure Modal / Gate Inspection */}
      {showCloseModal && (
        <div className="rounded-3xl border border-rose-500/30 bg-slate-900/90 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center">
              <Lock className="mr-2 h-5 w-5 text-rose-400" />
              การปิดสำนวนคดีและการตรวจสอบ Closure Gates
            </h3>
            <button type="button" onClick={() => setShowCloseModal(false)} className="text-xs text-slate-400 hover:text-white">
              ยกเลิก
            </button>
          </div>

          {closureBlockers.length > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 space-y-3">
              <p className="text-xs font-bold text-rose-300 flex items-center">
                <XCircle className="mr-1.5 h-4 w-4 shrink-0" />
                {closureMessage}
              </p>
              <div className="space-y-1.5 pt-2 border-t border-rose-900/40">
                {Object.entries(CLOSURE_GATE_LABELS).map(([gateKey, label]) => {
                  const isBlocked = closureBlockers.includes(gateKey);
                  return (
                    <div key={gateKey} className="flex items-center text-xs">
                      {isBlocked ? (
                        <XCircle className="mr-2 h-3.5 w-3.5 text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className={isBlocked ? 'text-rose-200 font-medium' : 'text-slate-400'}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleCloseCase} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">เหตุผลในการปิดสำนวน</label>
              <textarea
                required
                rows={2}
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="ระบุเหตุผลและผลการดำเนินงานก่อนปิดสำนวน"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isClosing}
                className="inline-flex items-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isClosing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                ยืนยันการปิดสำนวน
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/90 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center">
              <Unlock className="mr-2 h-5 w-5 text-emerald-400" />
              เปิดสำนวนคดีใหม่ (Admin Only)
            </h3>
            <button type="button" onClick={() => setShowReopenModal(false)} className="text-xs text-slate-400 hover:text-white">
              ยกเลิก
            </button>
          </div>
          <form onSubmit={handleReopenCase} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">เหตุผลในการเปิดสำนวนใหม่</label>
              <textarea
                required
                rows={2}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="ระบุเหตุผลที่ต้องเปิดสำนวนใหม่เพื่อสืบสวนเพิ่มเติม"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isReopening}
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isReopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
                ยืนยันการเปิดสำนวนใหม่
              </button>
            </div>
          </form>
        </div>
      )}

      {downloadError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{downloadError}</div>}

      {/* Evidence Files Registry */}
      <section className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center text-lg font-bold text-white">
              <Fingerprint className="mr-2 h-5 w-5 text-amber-300" />
              ทะเบียนหลักฐานต้นฉบับ
            </h2>
            <p className="mt-1 text-xs text-slate-500">ไม่เปิดเผย storage path; ดาวน์โหลดผ่าน signed URL อายุสั้นและเฉพาะไฟล์ที่ STORED/CLEAN</p>
          </div>
          <Link href="/evidence" className="text-xs font-semibold text-indigo-300 hover:text-indigo-200">
            เพิ่มหลักฐาน
          </Link>
        </div>
        <div className="mt-5 space-y-3">
          {evidence.length ? (
            evidence.map((item) => {
              const downloadable = isEvidenceUsable(item.upload_state, item.malware_scan_status);
              return (
                <article key={item.id} className="grid gap-4 rounded-2xl border border-slate-900 bg-slate-950/50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                      <p className="truncate text-sm font-semibold text-slate-200">{item.filename}</p>
                    </div>
                    <p className="mt-2 break-all font-mono text-[10px] text-slate-600">SHA-256 {item.sha256}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-md border border-slate-800 px-2 py-1 text-slate-400">{item.upload_state || 'UNKNOWN'}</span>
                      <span className={`rounded-md border px-2 py-1 ${downloadable ? 'border-emerald-500/20 text-emerald-300' : 'border-amber-500/20 text-amber-200'}`}>
                        {evidenceSafetyLabel(item.malware_scan_status)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!downloadable || downloadingId === item.id}
                    onClick={() => void download(item)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {downloadingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}ดาวน์โหลด
                  </button>
                </article>
              );
            })
          ) : (
            <div className="py-16 text-center">
              <FileCheck2 className="mx-auto h-10 w-10 text-slate-800" />
              <p className="mt-3 text-sm text-slate-500">ยังไม่มีหลักฐานที่เข้าถึงได้ในสำนวนนี้</p>
            </div>
          )}
        </div>
      </section>

      {/* Automated Case Intelligence Reconnaissance Engine (5-Dimension) */}
      <CaseIntelligenceReconWidget
        caseId={caseId}
        caseNumber={caseRecord.number}
        caseTitle={caseRecord.title}
        description={caseRecord.description}
        autoRunOnMount={true}
      />

      {/* Investigation Planner */}
      <section className="rounded-3xl border border-indigo-500/30 bg-indigo-950/20 p-6 space-y-5 shadow-[0_0_30px_rgba(99,102,241,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300 mb-1.5">
              <Sparkles className="h-3 w-3" />
              <span>AI Investigation Planner & SOP Automation</span>
            </div>
            <h2 className="flex items-center text-lg font-bold text-white">
              แผนงานสืบสวนอัตโนมัติ ({tasks.length} งาน)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              แผนปฏิบัติการสืบสวนและหนังสือขอพยานหลักฐานภายนอกที่ระบบสร้างขึ้นอัตโนมัติ
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {tasks.length > 0 ? (
            tasks.map((task) => {
              const isDone = task.status === 'DONE';
              const isInProgress = task.status === 'IN_PROGRESS';
              const isCritical = task.priority === 'CRITICAL';
              const isHigh = task.priority === 'HIGH';

              return (
                <article
                  key={task.id}
                  className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-400/30 transition-all duration-200"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          isCritical
                            ? 'border-rose-400/40 bg-rose-500/10 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                            : isHigh
                            ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                            : 'border-sky-400/40 bg-sky-500/10 text-sky-300'
                        }`}
                      >
                        PRIORITY: {task.priority}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          isDone
                            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                            : isInProgress
                            ? 'border-teal-400/40 bg-teal-500/10 text-teal-300 animate-pulse'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        STATUS: {task.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      {task.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {task.description}
                    </p>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="py-10 text-center rounded-2xl border border-dashed border-indigo-500/20">
              <p className="text-sm text-slate-400 font-semibold mb-2">ยังไม่มีงานสืบสวน</p>
              <p className="text-xs text-slate-500">
                งานสืบสวนจะถูกสร้างโดยอัตโนมัติเมื่อมีการยืนยันข้อมูลจากหลักฐาน (เช่น บัญชีม้า, เบอร์โทรศัพท์)
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Case Members Management */}
      <section className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center text-lg font-bold text-white">
              <Users className="mr-2 h-5 w-5 text-indigo-400" />
              คณะผู้รับผิดชอบสำนวนคดี ({members.length})
            </h2>
            <p className="mt-1 text-xs text-slate-500">เฉพาะเจ้าหน้าที่ที่มีสิทธิ์ในสำนวนเท่านั้นที่สามารถเข้าถึงและตรวจทานหลักฐานได้</p>
          </div>
        </div>

        {memberActionError && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300 flex items-center">
            <AlertCircle className="mr-2 h-4 w-4 shrink-0" />
            {memberActionError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <div key={member.id} className="rounded-2xl border border-slate-900 bg-slate-950/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{member.profile?.name || member.profile_id}</p>
                <p className="text-xs text-slate-500">{member.profile?.email || '-'}</p>
                <span className={`mt-2 inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold border ${member.role === 'OWNER' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-800 bg-slate-900 text-slate-400'}`}>
                  {member.role === 'OWNER' ? 'ผู้รับผิดชอบหลัก (OWNER)' : 'ผู้ร่วมคณะ (MEMBER)'}
                </span>
              </div>
              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.profile_id)}
                  title="นำออกจากสำนวน"
                  className="text-slate-600 hover:text-rose-400 p-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleAddMember} className="pt-4 border-t border-slate-900 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="ระบุ Profile UUID ของเจ้าหน้าที่"
            value={newMemberProfileId}
            onChange={(e) => setNewMemberProfileId(e.target.value)}
            className="flex-1 min-w-[240px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
          />
          <select
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value as 'OWNER' | 'MEMBER')}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="MEMBER">MEMBER (ผู้ร่วม)</option>
            <option value="OWNER">OWNER (หัวหน้า)</option>
          </select>
          <button
            type="submit"
            disabled={isAddingMember || !newMemberProfileId.trim()}
            className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isAddingMember ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
            เพิ่มเจ้าหน้าที่
          </button>
        </form>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs leading-6 text-sky-100">
        <ShieldAlert className="mt-1 h-4 w-4 shrink-0" />
        ระบบความถูกต้อง: การปิดสำนวนคดีต้องผ่านการตรวจสอบ Closure Gates ทั้ง 5 ด่านอย่างสมบูรณ์ และการเปิดสำนวนใหม่ต้องดำเนินการโดย Admin เท่านั้น
      </div>
    </div>
  );
}
