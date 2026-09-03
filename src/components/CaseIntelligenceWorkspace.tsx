'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, CheckCircle2, ClipboardCopy, Database, Download, ExternalLink, FileSearch, FileText, Fingerprint, Loader2, Network, Radar, RefreshCw, SearchCheck, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import { ReconAutomationPanel, type ReconExecutionOutcome } from '@/components/ReconAutomationPanel';
import { EvidenceScreeningPanel } from '@/components/EvidenceScreeningPanel';
import type { CaseIntelligenceSearchResult, CaseReconSummary, DossierDocument, IntelligenceFindingKind, ReconDimensionStatus } from '@/lib/case-intelligence';

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

const findingStyle: Record<IntelligenceFindingKind, string> = {
  VERIFIED_FACT: 'border-emerald-500/25 bg-emerald-500/[0.055]',
  VERIFIED_RELATIONSHIP: 'border-cyan-500/25 bg-cyan-500/[0.055]',
  TRUSTED_REGISTRY: 'border-indigo-500/25 bg-indigo-500/[0.07]',
  GROUNDED_WEB: 'border-sky-500/25 bg-sky-500/[0.06]',
};

export function CaseIntelligenceWorkspace({ caseId }: { caseId: string }) {
  const [report, setReport] = useState<CaseReconSummary | null>(null);
  const [search, setSearch] = useState<CaseIntelligenceSearchResult | null>(null);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DossierDocument | null>(null);
  const [loading, setLoading] = useState<'recon' | 'dossier' | ''>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [automationExecutionId, setAutomationExecutionId] = useState(0);
  const [automationNotice, setAutomationNotice] = useState('');
  const [extractionFallbackAvailable, setExtractionFallbackAvailable] = useState(false);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationOutcomes, setAutomationOutcomes] = useState<ReconExecutionOutcome[]>([]);
  const [screeningRefreshId, setScreeningRefreshId] = useState(0);
  const extractionPreparationKey = useRef('');
  const handleAutomationFinished = useCallback((outcomes: ReconExecutionOutcome[]) => {
    setAutomationOutcomes(outcomes);
    const completed = outcomes.filter((item) => item.status === 'COMPLETE').length;
    const failed = outcomes.filter((item) => item.status === 'FAILED').length;
    setAutomationNotice(`ค้นระบบต้นทางเสร็จแล้ว ${completed} งาน${failed > 0 ? ` · ไม่สำเร็จ ${failed} งาน` : ''} · ผลที่สำเร็จถูกนำเข้า Evidence Vault พร้อม SHA-256`);
    if (completed > 0) setScreeningRefreshId((value) => value + 1);
  }, []);

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
    setExtractionFallbackAvailable(false);
    setAutomationNotice('กำลังรวบรวมข้อมูลที่ผูกกับหลักฐานและจัดแผนช่องค้นของแต่ละระบบ…');
    setAutomationOutcomes([]);
    try {
      let preparationFailure = '';
      let data = await post<{ report: CaseReconSummary; search: CaseIntelligenceSearchResult }>('/api/v1/intelligence/recon');
      const evidencePreparationKey = data.search.evidenceInventory.map((item) => item.id).sort().join(':');
      if (data.search.automationPlan.length === 0 && data.search.evidenceInventory.length > 0 && extractionPreparationKey.current !== evidencePreparationKey) {
        setAutomationNotice('ยังไม่มีค่าที่ค้นได้ ระบบกำลังสกัดข้อมูลจากหลักฐานที่จัดเก็บและตรวจโครงสร้างแล้ว เพื่อสร้างข้อเสนอสำหรับค้นต่อ…');
        const extractionResults = await Promise.allSettled(data.search.evidenceInventory.slice(0, 5).map(async (evidence) => {
          const response = await fetch('/api/v1/ai/extract', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              case_id: caseId,
              evidence_id: evidence.id,
              page_number: 1,
              source_location: { kind: 'AUTO_RECON_PREPARATION' },
            }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) throw new Error(body?.error?.message || `สกัดข้อมูลจาก ${evidence.filename} ไม่สำเร็จ`);
          return body;
        }));
        if (extractionResults.some((result) => result.status === 'fulfilled')) {
          extractionPreparationKey.current = evidencePreparationKey;
          data = await post<{ report: CaseReconSummary; search: CaseIntelligenceSearchResult }>('/api/v1/intelligence/recon');
        }
        else {
          extractionPreparationKey.current = '';
          setExtractionFallbackAvailable(true);
          const firstFailure = extractionResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
          const failureMessage = firstFailure?.reason instanceof Error ? firstFailure.reason.message : 'ยังสกัดข้อมูลสำหรับค้นอัตโนมัติไม่ได้';
          preparationFailure = `${failureMessage} · กดค้นอีกครั้งเพื่อลองใหม่ หรือเปิดคิวตรวจทานเพื่อบันทึกข้อมูลจากหลักฐานด้วยตนเอง`;
        }
      }
      setReport(data.report);
      setSearch(data.search);
      setScreeningRefreshId((value) => value + 1);
      if (data.search.automationPlan.length > 0) {
        setAutomationNotice(`จัดแผนค้นอัตโนมัติแล้ว ${data.search.automationPlan.length} งาน กำลังส่งข้อมูลไปยังช่องค้นที่ถูกต้องบนเครื่องเจ้าหน้าที่`);
        setAutomationExecutionId((value) => value + 1);
      }
      else if (preparationFailure) {
        setAutomationNotice(preparationFailure);
      }
      else if (data.search.publicWebFindingCount > 0) {
        setAutomationNotice(`ค้นเว็บสาธารณะและ Open Data แล้ว พบแหล่งอ้างอิง ${data.search.publicWebFindingCount} รายการ ระบบร้อยเรียงไว้ในคำตอบด้านล่าง`);
      }
      else if (data.search.blockedAutomation.length > 0) {
        setAutomationNotice('พบข้อมูลสำหรับค้น แต่ระบบต้นทางที่เกี่ยวข้องใช้ HTTP จึงพักไว้และแสดงเหตุผลให้เจ้าหน้าที่ยืนยันความเสี่ยงก่อน');
      }
      else if (data.search.pendingReviewCount > 0) {
        setAutomationNotice('พบข้อเสนอจากการสกัดข้อมูล แต่ยังไม่มีค่าที่ผ่านเกณฑ์ความเชื่อมั่นสำหรับส่งไปค้นอัตโนมัติ กรุณาตรวจทานข้อเสนอในคิวตรวจทาน');
      }
      else {
        setAutomationNotice('ยังไม่มีชื่อ เลขประจำตัว หรือข้อมูลที่มีแหล่งอ้างอิงเพียงพอสำหรับส่งไปค้นอัตโนมัติ');
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'เปิด workspace ไม่สำเร็จ');
      setAutomationNotice('');
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
    <section className="relative isolate space-y-5 overflow-hidden rounded-[32px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.12),transparent_34%),rgba(7,15,29,0.82)] p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(94,234,212,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(94,234,212,.55) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 -z-10 h-52 w-52 rounded-full border border-cyan-300/10 shadow-[0_0_90px_rgba(45,212,191,0.16)]" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)] motion-safe:animate-pulse" /> Trusted Intelligence Grid
          </div>
          <div className="flex items-center gap-3 text-indigo-300">
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-indigo-300/15 bg-indigo-300/[0.07] shadow-[inset_0_0_20px_rgba(129,140,248,0.08)]"><Radar className="h-5 w-5" /></span>
            <div><h2 className="text-lg font-black tracking-tight text-white">Case Intelligence Workspace</h2><p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600">Source-bound analysis core</p></div>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
            ครอบคลุม 10 มิติ: ทะเบียนราชการ ชื่อ/เบอร์โทร ภาพถ่าย สถานที่ พยานแวดล้อม ความเชื่อมโยง และกฎหมาย พร้อม Recon Companion สำหรับล็อกอินระบบที่อนุญาตบนเครื่องเจ้าหน้าที่ โดยไม่ส่งรหัสผ่านขึ้น Cloudflare/Supabase
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={runRecon} disabled={Boolean(loading) || automationRunning} className="inline-flex min-h-12 items-center rounded-2xl border border-cyan-200/40 bg-gradient-to-r from-cyan-300 to-teal-300 px-5 py-3 text-xs font-black text-slate-950 shadow-[0_0_28px_rgba(45,212,191,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgba(45,212,191,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:translate-y-0 disabled:opacity-50 motion-reduce:transition-none">
            {loading === 'recon' || automationRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
            ค้นอัตโนมัติและเก็บหลักฐาน
          </button>
          <button type="button" onClick={createDossier} disabled={Boolean(loading) || automationRunning} className="inline-flex min-h-12 items-center rounded-2xl border border-indigo-300/25 bg-indigo-300/[0.07] px-4 py-3 text-xs font-bold text-indigo-100 transition hover:border-indigo-300/40 hover:bg-indigo-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-50 motion-reduce:transition-none">
            {loading === 'dossier' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            สร้างร่างแฟ้ม
          </button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300"><ShieldAlert className="h-4 w-4" />{error}</div>}
      {automationNotice && <div role="status" aria-live="polite" className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-xs text-cyan-100"><div className="flex items-start gap-2">{loading === 'recon' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}<span>{automationNotice}</span></div>{extractionFallbackAvailable && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={runRecon} disabled={loading !== ''} className="inline-flex min-h-9 items-center rounded-xl bg-cyan-300 px-3 font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />ลองค้นใหม่</button><Link href="/review" className="inline-flex min-h-9 items-center rounded-xl border border-cyan-200/20 px-3 font-bold text-cyan-100 hover:bg-cyan-200/[0.08]">เปิด Manual fallback</Link></div>}</div>}

      {!report && !error && (
        <div className="relative overflow-hidden rounded-3xl border border-dashed border-cyan-300/15 bg-slate-950/35 p-8 text-center">
          <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/[0.04]">
            <span className="absolute inset-2 rounded-full border border-cyan-300/10 motion-safe:animate-pulse" /><Radar className="h-8 w-8 text-cyan-200/55" />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-300">พร้อมสแกนข้อมูลที่ตรวจย้อนกลับได้</p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-slate-500">กด “ค้นข้อมูลที่เกี่ยวข้อง” เพื่อรวบรวมเฉพาะผลที่ย้อนกลับถึงหลักฐานในคดีหรือทะเบียนที่ระบบอนุมัติได้</p>
        </div>
      )}

      {report && search && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.72),rgba(15,23,42,0.72)_48%,rgba(49,46,129,0.36))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6" role="status" aria-live="polite">
            <div aria-hidden="true" className="absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-200"><Activity className="h-3 w-3" /> Analysis complete</span><span className="font-mono text-[9px] text-slate-500">{new Date(search.generatedAt).toLocaleString('th-TH')}</span></div>
                <div className="mt-4 flex items-center gap-2 text-cyan-200"><Sparkles className="h-5 w-5" /><h3 className="text-lg font-black text-white">คำตอบจากการค้น</h3></div>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-200">{search.summary}{automationOutcomes.length > 0 ? ` ระบบต้นทางที่ล็อกอินด้วยบัญชีเจ้าหน้าที่ส่งผลกลับมา ${automationOutcomes.filter((item) => item.status === 'COMPLETE').length} แหล่ง รวม ${automationOutcomes.reduce((sum, item) => sum + (item.result?.resultRowCount || 0), 0)} แถวข้อมูล` : ''}</p>
              </div>
              <div className="flex min-w-36 items-end gap-3 rounded-2xl border border-white/[0.07] bg-slate-950/35 px-4 py-3 lg:block lg:text-right"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-300/70">Signals found</p><p className="text-4xl font-black tracking-[-0.06em] text-white">{search.findings.length + automationOutcomes.reduce((sum, item) => sum + (item.result?.resultRowCount || 0), 0)}</p><p className="mb-1 text-[10px] text-slate-500 lg:mb-0">รายการอ้างอิงได้</p></div>
            </div>
            <div className="relative mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-emerald-300/10 bg-slate-950/30 p-3.5"><div className="flex items-center justify-between"><Fingerprint className="h-4 w-4 text-emerald-300" /><span className="font-mono text-[9px] text-emerald-300/60">EVIDENCE</span></div><p className="mt-3 text-2xl font-black text-white">{search.verifiedFindingCount}</p><p className="text-[10px] text-slate-500">หลักฐานที่ตรวจแล้ว</p></div>
              <div className="rounded-2xl border border-indigo-300/10 bg-slate-950/30 p-3.5"><div className="flex items-center justify-between"><Database className="h-4 w-4 text-indigo-300" /><span className="font-mono text-[9px] text-indigo-300/60">REGISTRY</span></div><p className="mt-3 text-2xl font-black text-white">{search.registryFindingCount}</p><p className="text-[10px] text-slate-500">ทะเบียนที่อนุมัติ</p></div>
              <div className="rounded-2xl border border-sky-300/10 bg-slate-950/30 p-3.5"><div className="flex items-center justify-between"><SearchCheck className="h-4 w-4 text-sky-300" /><span className="font-mono text-[9px] text-sky-300/60">PUBLIC WEB</span></div><p className="mt-3 text-2xl font-black text-white">{search.publicWebFindingCount}</p><p className="text-[10px] text-slate-500">เว็บสาธารณะมี citation</p></div>
              <div className="rounded-2xl border border-amber-300/10 bg-slate-950/30 p-3.5"><div className="flex items-center justify-between"><Network className="h-4 w-4 text-amber-300" /><span className="font-mono text-[9px] text-amber-300/60">REVIEW QUEUE</span></div><p className="mt-3 text-2xl font-black text-white">{search.pendingReviewCount}</p><p className="text-[10px] text-slate-500">ข้อเสนอรอตรวจทาน</p></div>
            </div>
          </div>

          {search.sourceRecommendations.length > 0 && <section className="rounded-[26px] border border-indigo-300/18 bg-indigo-300/[0.035] p-4 sm:p-5" aria-label="แหล่งสืบค้นที่ตรงกับประเภทคดี"><div className="flex items-start gap-3"><Database className="mt-0.5 h-5 w-5 text-indigo-300" /><div><p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-300/65">Case-scoped source routing</p><h3 className="mt-1 text-base font-black text-white">เลือกแหล่งค้นตามประเภทคดีแล้ว</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">ระบบจะไม่ส่งคดีนี้ไปค้นทะเบียนคนละประเภท รายการด้านล่างคือฐานทางการที่ถูกใช้กำหนดขอบเขตการค้นเว็บและ Open Data</p></div></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{search.sourceRecommendations.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-indigo-300/12 bg-slate-950/35 p-4 transition hover:border-indigo-300/30"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-black text-white">{source.label}</h4><p className="mt-1 text-[9px] text-indigo-200/65">{source.authority}</p><p className="mt-2 text-[10px] leading-5 text-slate-400">{source.purpose}</p></div><ExternalLink className="h-4 w-4 shrink-0 text-indigo-300" /></div></a>)}</div></section>}

          {(search.automationPlan.length > 0 || search.blockedAutomation.length > 0) && <details className="rounded-[26px] border border-cyan-300/12 bg-slate-950/30" open={automationRunning || (automationExecutionId > 0 && automationOutcomes.length === 0) || (search.automationPlan.length === 0 && search.blockedAutomation.length > 0)}><summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-cyan-100 sm:px-5">รายละเอียดการล็อกอิน ค้นหา และเก็บหลักฐานจากระบบต้นทาง <span className="ml-2 font-mono text-[9px] text-slate-500">{automationRunning ? 'กำลังทำงาน…' : `${automationOutcomes.filter((item) => item.status === 'COMPLETE').length}/${search.automationPlan.length} สำเร็จ`}</span></summary><div className="border-t border-white/[0.06] p-2"><ReconAutomationPanel caseId={caseId} plan={search.automationPlan} blocked={search.blockedAutomation} executionId={automationExecutionId} onRunningChange={setAutomationRunning} onFinished={handleAutomationFinished} /></div></details>}

          {automationOutcomes.some((item) => item.status === 'COMPLETE') && <section className="rounded-[28px] border border-emerald-300/18 bg-emerald-300/[0.035] p-4 sm:p-5" aria-label="คำตอบที่รวบรวมจากระบบต้นทาง"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300/65">Credentialed source answer</p><h3 className="mt-1 text-base font-black text-white">สิ่งที่พบจากระบบที่ล็อกอินค้นหาให้แล้ว</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">ผลทุกชิ้นมี PDF, เวลา, URL ต้นทาง และ SHA-256 แต่ยังต้องให้เจ้าหน้าที่ตรวจว่าเป็นบุคคลหรือกิจการเดียวกับสำนวน</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{automationOutcomes.filter((item) => item.status === 'COMPLETE').map((item) => <article key={item.planId} className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-black text-white">{item.sourceLabel} · {item.serviceLabel}</h4><p className="mt-1 text-[10px] text-slate-500">ค้นด้วย {item.fieldLabel}: {item.displayValue}</p></div><span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2 py-1 font-mono text-[9px] text-emerald-200">{item.result?.resultRowCount || 0} RESULTS</span></div>{item.result?.resultSummaries.length ? <ol className="mt-3 space-y-2">{item.result.resultSummaries.map((summary, index) => <li key={`${item.planId}:${index}`} className="rounded-xl border border-white/[0.055] bg-white/[0.025] p-3 text-[10px] leading-5 text-slate-300"><span className="mr-2 font-mono font-black text-emerald-300">{index + 1}.</span>{summary}</li>)}</ol> : <p className="mt-3 text-[10px] leading-5 text-slate-400">หน้าผลค้นไม่แสดงรายการ ณ เวลาที่ค้น ซึ่งยังไม่ใช่ข้อยืนยันว่าไม่มีข้อมูล</p>}<div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3 font-mono text-[8px] text-slate-600"><ShieldCheck className="h-3 w-3 text-emerald-300" />PDF SHA-256 {item.result?.pdfSha256.slice(0, 16)}…</div></article>)}</div></section>}

          {search.evidenceInventory.length > 0 && (
            <div className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4 sm:p-5" aria-label="หลักฐานต้นฉบับที่พบในคดี">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-black text-white"><Fingerprint className="h-4 w-4 text-emerald-300" />หลักฐานต้นฉบับที่ระบบพบ</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">ไฟล์เหล่านี้จัดเก็บสมบูรณ์และผ่านการตรวจชนิด/โครงสร้างแล้ว สถานะการสแกนจะแสดงตามจริง ไม่กล่าวอ้างว่า CLEAN หากไม่ได้สแกน</p></div><span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1 font-mono text-[9px] font-bold text-emerald-200">{search.evidenceInventory.length} VALIDATED FILE{search.evidenceInventory.length === 1 ? '' : 'S'}</span></div>
              <div className="mt-4 grid gap-2 lg:grid-cols-2">
                {search.evidenceInventory.map((item, index) => (
                  <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.065] bg-slate-950/35 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] font-mono text-[10px] font-black text-emerald-200">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><h4 className="truncate text-xs font-bold text-white" title={item.filename}>{item.filename}</h4><p className="mt-1 truncate font-mono text-[9px] text-slate-600" title={item.sha256}>SHA-256 {item.sha256}</p><p className="mt-1 text-[9px] text-emerald-300/70">{item.safetyStatus === 'CLEAN' ? 'ตรวจสอบไฟล์แล้ว' : 'ตรวจชนิดและโครงสร้างแล้ว · ไม่ได้สแกนมัลแวร์'}</p></div></div>
                    <div className="flex shrink-0 gap-2"><Link href="/evidence" className="inline-flex min-h-9 items-center rounded-xl border border-slate-700 px-3 text-[10px] font-bold text-slate-300 hover:border-slate-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">ดูไฟล์</Link><Link href="/review" className="inline-flex min-h-9 items-center rounded-xl bg-emerald-300 px-3 text-[10px] font-black text-slate-950 hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100">สกัดและตรวจทาน</Link></div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {search.findings.length > 0 ? (
            <div className="space-y-3" aria-label="รายการข้อมูลที่เกี่ยวข้อง">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="flex items-center gap-2 text-base font-black text-white"><FileSearch className="h-5 w-5 text-indigo-300" />ข้อมูลที่ระบบพบ</h3><p className="mt-1 text-[10px] text-slate-500">ผลจากเว็บผ่านการกรองคำค้นและโดเมนแล้ว แต่ยังต้องเปิด citation ตรวจทานโดยเจ้าหน้าที่</p></div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" /> Citation required</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {search.findings.map((finding, index) => {
                  const FindingIcon = finding.kind === 'VERIFIED_FACT' ? Fingerprint : finding.kind === 'VERIFIED_RELATIONSHIP' ? Network : finding.kind === 'GROUNDED_WEB' ? SearchCheck : Database;
                  return (
                  <article key={finding.id} className={`group relative overflow-hidden rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:border-cyan-200/25 hover:shadow-[0_16px_44px_rgba(2,8,23,0.35)] motion-reduce:transition-none ${findingStyle[finding.kind]}`}>
                    <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-200/70 to-transparent" aria-hidden="true" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-slate-950/45 text-cyan-200"><FindingIcon className="h-4 w-4" /></span><div className="min-w-0"><p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300/60">Intel signal {String(index + 1).padStart(2, '0')}</p><h4 className="mt-1 text-sm font-black leading-relaxed text-white">{finding.title}</h4></div></div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/45 px-2 py-1 text-[9px] font-semibold text-slate-200">{finding.statusLabel}</span>
                    </div>
                    <p className="mt-4 rounded-2xl border border-white/[0.055] bg-slate-950/30 p-3.5 text-xs leading-6 text-slate-300">{finding.detail}</p>
                    <div className="mt-4 border-t border-white/[0.08] pt-4 text-[10px] text-slate-400">
                      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" /><div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">{finding.kind === 'GROUNDED_WEB' ? 'Cited source · review required' : 'Verified source'}</p><p className="mt-1 font-semibold text-slate-200">{finding.source.label}</p>{finding.source.pageNumber && <p className="mt-1">หน้า {finding.source.pageNumber}{finding.source.sha256 ? ` · SHA-256 ${finding.source.sha256.slice(0, 12)}…` : ''}</p>}{finding.source.publishedDate && <p className="mt-1">{finding.kind === 'GROUNDED_WEB' ? 'ตรวจค้นเมื่อ' : 'วันที่ในทะเบียน'}: {finding.source.publishedDate}</p>}</div></div>
                      <div className="mt-3">
                        {finding.source.url
                          ? <a href={finding.source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-xl border border-indigo-300/15 bg-indigo-300/[0.06] px-3 font-semibold text-indigo-200 hover:bg-indigo-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">เปิดแหล่งต้นทาง <ExternalLink className="ml-1.5 h-3 w-3" /></a>
                          : <Link href="/evidence" className="inline-flex min-h-9 items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 font-semibold text-cyan-200 hover:bg-cyan-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">เปิดคลังหลักฐาน <ExternalLink className="ml-1.5 h-3 w-3" /></Link>}
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/[0.04] p-5">
              <h3 className="text-sm font-bold text-amber-100">ยังไม่มีผลที่อ้างอิงได้</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">ระบบจะไม่สร้างคำตอบจากการคาดเดา กรุณาสกัดข้อมูลจากหลักฐานและให้ผู้ตรวจทานยืนยันก่อน แล้วจึงค้นใหม่</p>
              <div className="mt-3 flex flex-wrap gap-2"><Link href="/review" className="rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-bold text-slate-950">ไปยังคิวตรวจทาน</Link><Link href="/sources" className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-200">เปิดแหล่งสืบค้นทางการ</Link></div>
            </div>
          )}

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100">
            <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><p>{search.notice}</p><p className="mt-1 text-amber-200/70">{search.registryStatus === 'SEARCHED' ? `ค้นทะเบียนด้วยค่าที่มีหลักฐานรองรับ ${search.searchedRegistryTermCount} ค่าแล้ว` : search.registryStatus === 'NO_ELIGIBLE_TERMS' ? 'ยังไม่มีคำค้นที่มีหลักฐานรองรับเพียงพอ' : search.registryStatus === 'UNAVAILABLE' ? 'ทะเบียนที่อนุมัติบางส่วนไม่พร้อมใช้งาน ผลครั้งนี้อาจไม่ครบ กรุณาลองใหม่' : 'โหมดสาธิตไม่เรียกทะเบียนภายนอกจริง'} · {search.publicWebStatus === 'SEARCHED' ? `ค้นเว็บสาธารณะแบบมี citation ${search.publicWebQueryCount} คำค้น${search.publicWebTokenUsage ? ` · AI ${search.publicWebTokenUsage.total.toLocaleString('th-TH')} tokens (เข้า ${search.publicWebTokenUsage.prompt.toLocaleString('th-TH')} / ออก ${search.publicWebTokenUsage.candidates.toLocaleString('th-TH')})` : ''}` : search.publicWebStatus === 'UNAVAILABLE' ? 'การค้นเว็บสาธารณะไม่พร้อมใช้งานในครั้งนี้' : search.publicWebStatus === 'NOT_CONFIGURED' ? 'ยังไม่ได้ตั้งค่าการค้นเว็บสาธารณะ' : 'ยังไม่มีคำค้นสำหรับเว็บสาธารณะ'}</p></div></div>
          </div>

          <details className="rounded-2xl border border-white/[0.06] bg-slate-950/25"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-300">ดูขอบเขตและช่องทางที่ระบบตรวจสอบทั้งหมด (ข้อมูลประกอบ ไม่ใช่คำตอบหลัก)</summary><div className="space-y-4 border-t border-white/[0.06] p-4">
          <h3 className="pt-2 text-sm font-bold text-white">สถานะขอบเขตการตรวจสอบ</h3>
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
          <p className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-950/35 p-3 text-[11px] leading-relaxed text-slate-400"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{report.notice}</p>
          </div></details>
        </div>
      )}

      <EvidenceScreeningPanel caseId={caseId} refreshSignal={screeningRefreshId} />

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
