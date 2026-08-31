'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ChevronRight, CircleDot, ExternalLink, FileCheck2, GitBranch, Lightbulb, Loader2, RefreshCw, SearchCheck, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Assessment = {
  id: string;
  evidenceId: string;
  filename: string;
  sha256: string;
  classification: 'DIRECT' | 'CORROBORATIVE' | 'CONTRADICTORY' | 'CONTEXTUAL' | 'DUPLICATE' | 'LOW_RELEVANCE' | 'REVIEW_REQUIRED';
  summary: string;
  reason: string;
  confidence: number;
  status: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';
  canReview: boolean;
  sourceCount: number;
};

type ScreeningData = {
  case: { id: string; number: string; title: string };
  permissions: { canRefresh: boolean };
  generatedBy: { provider: string; model: string; aiRequired: boolean };
  notice: string;
  counts: { total: number; confirmed: number; pendingReview: number; connectedEntities: number };
  automation: {
    status: 'AUTO_ADVICE_READY' | 'DATA_REQUIRED';
    completedStages: Array<'AUTO_FOUND' | 'AUTO_ANALYZED' | 'AUTO_ADVICE'>;
    summary: string;
    officialGate: string;
  };
  automaticAdvice: Array<{
    id: string;
    status: 'AUTO_ADVICE';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: 'EVIDENCE_PRIORITY' | 'CONFLICT_CHECK' | 'SOURCE_EXPANSION' | 'DATA_GAP' | 'LEGAL_RESEARCH';
    title: string;
    recommendation: string;
    rationale: string;
    confidence: number;
    sourceEvidenceIds: string[];
    sourceCount: number;
    officialConfirmationRequired: boolean;
    sources?: Array<{ label: string; authority: string; url: string; scope: string; access: 'PUBLIC' | 'STAFF' }>;
  }>;
  assessments: Assessment[];
  graph: {
    nodes: Array<{ id: string; kind: 'CASE' | 'EVIDENCE' | 'ENTITY'; label: string; subtitle: string; status: string }>;
    edges: Array<{ id: string; source: string; target: string; label: string; status: string }>;
  };
};

const classificationLabel: Record<Assessment['classification'], string> = {
  DIRECT: 'เกี่ยวข้องโดยตรง',
  CORROBORATIVE: 'สนับสนุนร่วมกัน',
  CONTRADICTORY: 'อาจขัดแย้ง',
  CONTEXTUAL: 'ข้อมูลประกอบ',
  DUPLICATE: 'ซ้ำ',
  LOW_RELEVANCE: 'เกี่ยวข้องต่ำ',
  REVIEW_REQUIRED: 'รอตรวจทาน',
};

const classificationStyle: Record<Assessment['classification'], string> = {
  DIRECT: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200',
  CORROBORATIVE: 'border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-200',
  CONTRADICTORY: 'border-rose-300/25 bg-rose-300/[0.08] text-rose-200',
  CONTEXTUAL: 'border-indigo-300/20 bg-indigo-300/[0.07] text-indigo-200',
  DUPLICATE: 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200',
  LOW_RELEVANCE: 'border-slate-500/30 bg-slate-500/[0.08] text-slate-300',
  REVIEW_REQUIRED: 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200',
};

const automationStages: Array<{
  stage: 'AUTO_FOUND' | 'AUTO_ANALYZED' | 'AUTO_ADVICE';
  label: string;
  Icon: LucideIcon;
}> = [
  { stage: 'AUTO_FOUND', label: 'ค้นพบ', Icon: SearchCheck },
  { stage: 'AUTO_ANALYZED', label: 'วิเคราะห์', Icon: GitBranch },
  { stage: 'AUTO_ADVICE', label: 'แนะนำ', Icon: Lightbulb },
];

export function EvidenceScreeningPanel({ caseId, refreshSignal = 0 }: { caseId: string; refreshSignal?: number }) {
  const [data, setData] = useState<ScreeningData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const automaticRefreshAttempted = useRef(false);
  const lastRefreshSignal = useRef(0);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(refresh ? '/api/v1/intelligence/screening' : `/api/v1/intelligence/screening?case_id=${encodeURIComponent(caseId)}`, {
        method: refresh ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: refresh ? { 'Content-Type': 'application/json' } : undefined,
        body: refresh ? JSON.stringify({ case_id: caseId }) : undefined,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || 'สกรีนนิ่งหลักฐานไม่สำเร็จ');
      setData(body.data as ScreeningData);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'สกรีนนิ่งหลักฐานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    automaticRefreshAttempted.current = false;
    const timer = window.setTimeout(() => { void load(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [caseId, load]);

  useEffect(() => {
    if (!data || data.counts.total > 0 || !data.permissions.canRefresh || automaticRefreshAttempted.current) return;
    automaticRefreshAttempted.current = true;
    const timer = window.setTimeout(() => { void load(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [data, load]);

  useEffect(() => {
    if (!data || refreshSignal <= lastRefreshSignal.current) return;
    lastRefreshSignal.current = refreshSignal;
    if (!data.permissions.canRefresh) return;
    const timer = window.setTimeout(() => { void load(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [data, load, refreshSignal]);

  async function review(decision: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN') {
    if (!reviewId || !reviewReason.trim()) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/intelligence/screening/${encodeURIComponent(reviewId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reviewReason.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || 'บันทึกผลตรวจทานไม่สำเร็จ');
      setReviewId('');
      setReviewReason('');
      await load(false);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'บันทึกผลตรวจทานไม่สำเร็จ');
      setLoading(false);
    }
  }

  const graph = useMemo(() => {
    const caseNode = data?.graph.nodes.find((node) => node.kind === 'CASE');
    const evidenceNodes = data?.graph.nodes.filter((node) => node.kind === 'EVIDENCE') || [];
    const entityNodes = data?.graph.nodes.filter((node) => node.kind === 'ENTITY') || [];
    return { caseNode, evidenceNodes, entityNodes };
  }, [data]);

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-fuchsia-300/15 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.11),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.10),transparent_30%),rgba(2,8,23,0.55)] p-4 sm:p-6" aria-label="สกรีนนิ่งและผังพยานหลักฐาน">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">Evidence relevance engine</p>
          <h3 className="mt-2 flex items-center gap-2 text-base font-black text-white"><GitBranch className="h-5 w-5 text-fuchsia-200" />สกรีนนิ่งหลักฐานและผังความเชื่อมโยง</h3>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">ระบบเริ่มสกรีนนิ่งอัตโนมัติเมื่อเปิดคดี จัดกลุ่มจากข้อมูลที่ย้อนกลับถึงไฟล์และหน้าได้ พร้อมแสดงคำแนะนำ เหตุผล และระดับความเชื่อมั่นทันที</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading || !data?.permissions.canRefresh} title={data && !data.permissions.canRefresh ? 'บัญชีนี้มีสิทธิ์ดูผล แต่ไม่มีสิทธิ์สั่งประมวลผลใหม่' : undefined} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-fuchsia-200/25 bg-fuchsia-200/[0.08] px-4 text-xs font-black text-fuchsia-100 transition hover:bg-fuchsia-200/[0.14] disabled:opacity-50">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}ประมวลผลใหม่
        </button>
      </div>

      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-xs text-rose-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {!data && !error && <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">{loading ? 'กำลังค้นหา วิเคราะห์ และสร้างคำแนะนำอัตโนมัติ…' : 'กำลังเตรียมการวิเคราะห์หลักฐานทั้งหมดในคดี'}</div>}

      {data && (
        <div className="mt-5 space-y-5">
          <div className="overflow-hidden rounded-3xl border border-emerald-300/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.13),transparent_34%),rgba(2,14,20,0.72)]">
            <div className="flex flex-col gap-4 border-b border-emerald-300/10 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-2.5"><Bot className="h-5 w-5 text-emerald-200" /></div>
                <div><p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200/70">{data.automation.status}</p><h4 className="mt-1 text-base font-black text-white">คำตอบและคำแนะนำอัตโนมัติพร้อมใช้งาน</h4><p className="mt-1 text-xs leading-5 text-slate-400">{data.automation.summary}</p></div>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1.5 text-[10px] font-black text-emerald-100"><Sparkles className="mr-1.5 h-3.5 w-3.5" />ไม่ต้องรอการรับรองเพื่ออ่านคำแนะนำ</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-white/[0.04]" aria-label="สถานะการวิเคราะห์อัตโนมัติ">
              {automationStages.map(({ stage, label, Icon }) => {
                const complete = data.automation.completedStages.includes(stage);
                return <div key={stage} className="bg-slate-950/55 p-3 text-center"><Icon className={`mx-auto h-4 w-4 ${complete ? 'text-emerald-200' : 'text-slate-700'}`} /><p className={`mt-1 text-[9px] font-bold ${complete ? 'text-slate-200' : 'text-slate-600'}`}>{label}</p></div>;
              })}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2" aria-label="คำแนะนำอัตโนมัติ">
            {data.automaticAdvice.map((advice) => (
              <article key={advice.id} className={`rounded-3xl border p-4 ${advice.priority === 'HIGH' ? 'border-rose-300/20 bg-rose-300/[0.045]' : advice.priority === 'MEDIUM' ? 'border-cyan-300/15 bg-cyan-300/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 py-1 font-mono text-[8px] font-black text-emerald-200">AUTO_ADVICE</span><span className="text-[9px] font-bold text-slate-500">ลำดับ {advice.priority} · ความเชื่อมั่น {Math.round(advice.confidence * 100)}%</span></div>
                <h5 className="mt-3 text-sm font-black leading-6 text-white">{advice.title}</h5>
                <p className="mt-2 text-xs font-semibold leading-6 text-cyan-50">คำแนะนำ: {advice.recommendation}</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">เหตุผล: {advice.rationale}</p>
                {advice.sources?.length ? <div className="mt-3 space-y-2" aria-label="แหล่งกฎหมายที่ระบบจับคู่ให้"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200/70">แหล่งค้นที่ตรงบริบท</p>{advice.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 rounded-2xl border border-cyan-300/10 bg-slate-950/35 p-3 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.05]"><span><span className="block text-[10px] font-bold text-cyan-50">{source.label}</span><span className="mt-1 block text-[9px] leading-4 text-slate-500">{source.scope} · {source.access === 'STAFF' ? 'ต้องเข้าสู่ระบบเจ้าหน้าที่' : 'เปิดสาธารณะ'}</span></span><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200" /></a>)}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3 text-[9px] text-slate-500"><span>แหล่งอ้างอิง {advice.sourceCount}</span><span>·</span><span>{advice.officialConfirmationRequired ? 'ต้องรับรองก่อนบันทึกเป็นข้อเท็จจริงทางการ' : 'ใช้จัดลำดับงานได้ทันที'}</span></div>
              </article>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ['หลักฐานทั้งหมด', data.counts.total],
              ['ยืนยันแล้ว', data.counts.confirmed],
              ['รอรับรองทางการ', data.counts.pendingReview],
              ['ข้อมูลเชื่อมโยง', data.counts.connectedEntities],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-slate-950/35 p-3"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p></div>)}
          </div>

          <div className="overflow-x-auto rounded-3xl border border-cyan-300/10 bg-slate-950/40 p-4" aria-label="ไดอะแกรมความเชื่อมโยงหลักฐาน">
            <div className="grid min-w-[780px] grid-cols-[180px_32px_minmax(260px,1fr)_32px_minmax(220px,0.8fr)] items-center gap-3">
              <div className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/[0.08] p-4 shadow-[0_0_30px_rgba(217,70,239,0.08)]"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-fuchsia-200/60">CASE</p><p className="mt-2 text-sm font-black text-white">{graph.caseNode?.label}</p><p className="mt-1 text-[10px] leading-5 text-slate-400">{graph.caseNode?.subtitle}</p></div>
              <ChevronRight className="h-6 w-6 text-fuchsia-200/50" />
              <div className="space-y-2">{graph.evidenceNodes.length ? graph.evidenceNodes.map((node) => <div key={node.id} className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-3"><p className="truncate text-xs font-bold text-white" title={node.label}>{node.label}</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{node.subtitle}</p></div>) : <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-xs text-slate-500">ยังไม่มีผลสกรีนนิ่ง</div>}</div>
              <ChevronRight className="h-6 w-6 text-cyan-200/50" />
              <div className="space-y-2">{graph.entityNodes.length ? graph.entityNodes.map((node) => <div key={node.id} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-3"><p className="truncate text-xs font-bold text-white" title={node.label}>{node.label}</p><p className="mt-1 font-mono text-[8px] text-emerald-200/60">{node.subtitle} · ยืนยันแล้ว</p></div>) : <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-xs leading-5 text-slate-500">ยังไม่มีข้อมูลที่มนุษย์ยืนยันเพื่อเชื่อมโยง</div>}</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {data.assessments.map((assessment) => (
              <article key={assessment.id} className="rounded-3xl border border-white/[0.07] bg-slate-950/35 p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-white" title={assessment.filename}>{assessment.filename}</p><p className="mt-1 truncate font-mono text-[8px] text-slate-600">SHA-256 {assessment.sha256}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${classificationStyle[assessment.classification]}`}>{classificationLabel[assessment.classification]}</span></div>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-200">{assessment.summary}</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">เพราะ: {assessment.reason}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-[9px]"><span className="inline-flex items-center rounded-full border border-white/[0.08] px-2 py-1 text-slate-400"><CircleDot className="mr-1 h-3 w-3" />ความเชื่อมั่น {Math.round(assessment.confidence * 100)}%</span><span className="rounded-full border border-white/[0.08] px-2 py-1 text-slate-400">ร่องรอย {assessment.sourceCount}</span><span className={`rounded-full border px-2 py-1 ${assessment.status === 'CONFIRMED' ? 'border-emerald-300/20 text-emerald-200' : assessment.status === 'REJECTED' ? 'border-rose-300/20 text-rose-200' : 'border-amber-300/20 text-amber-200'}`}>{assessment.status === 'CONFIRMED' ? 'เจ้าหน้าที่ยืนยันแล้ว' : assessment.status === 'REJECTED' ? 'ไม่รับผลนี้' : 'ข้อเสนอรอตรวจ'}</span></div>
                {assessment.canReview && (reviewId === assessment.id ? <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-3"><label className="text-[10px] font-bold text-amber-100">เหตุผลการรับรองอย่างเป็นทางการ<textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} maxLength={2000} className="mt-2 min-h-20 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white outline-none focus:border-amber-300/50" placeholder="ระบุสิ่งที่ตรวจจากหลักฐานต้นฉบับ" /></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!reviewReason.trim() || loading} onClick={() => void review('CONFIRMED')} className="inline-flex min-h-9 items-center rounded-xl bg-emerald-300 px-3 text-[10px] font-black text-slate-950 disabled:opacity-50"><Check className="mr-1 h-3.5 w-3.5" />รับรองเป็นทางการ</button><button type="button" disabled={!reviewReason.trim() || loading} onClick={() => void review('UNCERTAIN')} className="min-h-9 rounded-xl border border-amber-300/20 px-3 text-[10px] font-bold text-amber-100 disabled:opacity-50">ยังไม่แน่ใจ</button><button type="button" disabled={!reviewReason.trim() || loading} onClick={() => void review('REJECTED')} className="inline-flex min-h-9 items-center rounded-xl border border-rose-300/20 px-3 text-[10px] font-bold text-rose-200 disabled:opacity-50"><X className="mr-1 h-3.5 w-3.5" />ไม่รับผล</button></div></div> : <button type="button" onClick={() => { setReviewId(assessment.id); setReviewReason(''); }} className="mt-3 inline-flex min-h-9 items-center rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 text-[10px] font-bold text-amber-100"><FileCheck2 className="mr-1.5 h-3.5 w-3.5" />รับรองเป็นข้อเท็จจริงทางการ</button>)}
              </article>
            ))}
          </div>

          <p className="flex items-start gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/30 p-3 text-[10px] leading-5 text-slate-500"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{data.automation.officialGate} · {data.notice} · Engine {data.generatedBy.model} ทำงานได้แม้ Gemini ไม่พร้อม</p>
        </div>
      )}
    </section>
  );
}
