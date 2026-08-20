'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Cpu,
  GitCompare,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { Case, MatchCandidate } from '@/lib/demo-data';

type MatchSource = { evidence_id: string; page_number: number; source_text: string };
type MatchRecord = MatchCandidate & {
  matching_signals?: Record<string, unknown>;
  review_reason?: string | null;
  sources?: MatchSource[];
};

const typeLabels: Record<string, string> = {
  PERSON: 'บุคคล (PERSON)',
  ORGANIZATION: 'องค์กร (ORGANIZATION)',
  PHONE: 'เบอร์โทรศัพท์ (PHONE)',
  EMAIL: 'อีเมล (EMAIL)',
  BANK_ACCOUNT: 'บัญชีธนาคาร (BANK_ACCOUNT)',
  CITIZEN_ID: 'เลขบัตรประชาชน (CITIZEN_ID)',
  LOCATION: 'สถานที่ (LOCATION)',
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingId, setSubmittingId] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'FUZZY' | 'EXACT'>('ALL');

  const triggerScan = async () => {
    setIsScanning(true);
    setActionError('');
    setSuccess('');
    try {
      const response = await fetch('/api/v1/matches/scan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'การสแกนความเชื่อมโยงล้มเหลว');
      const data = body.data || {};
      setSuccess(
        `สแกนเสร็จสิ้น: ตรวจพบความเชื่อมโยงทั้งหมด ${data.total_matches ?? 0} รายการ (Exact: ${data.exact_matches_found ?? 0}, Fuzzy: ${data.fuzzy_matches_found ?? 0}) จากข้อมูลที่สแกน ${data.scanned_entities ?? 0} เอนทิตี`
      );
      await load();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'สแกนความเชื่อมโยงไม่สำเร็จ');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredMatches = matches.filter((item) => {
    if (filterType === 'PENDING') return item.status === 'PENDING';
    if (filterType === 'VERIFIED') return item.status === 'VERIFIED';
    const isFuzzy = item.matching_signals && typeof item.matching_signals === 'object' && 'method' in item.matching_signals && item.matching_signals.method === 'TRIGRAM_FUZZY_SIMILARITY';
    if (filterType === 'FUZZY') return isFuzzy || item.confidence < 1.0;
    if (filterType === 'EXACT') return !isFuzzy && item.confidence === 1.0;
    return true;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/v1/matches', { signal, credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'โหลดรายการเชื่อมโยงไม่สำเร็จ');
      setMatches(body.data.matches as MatchRecord[]);
      setCases(body.data.cases as Case[]);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : 'โหลดรายการเชื่อมโยงไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/matches', { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดรายการเชื่อมโยงไม่สำเร็จ');
        setMatches(body.data.matches as MatchRecord[]);
        setCases(body.data.cases as Case[]);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'โหลดรายการเชื่อมโยงไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const review = async (item: MatchRecord, decision: 'VERIFIED' | 'DISMISSED') => {
    const reason = reasons[item.id]?.trim();
    if (!reason) {
      setActionError('กรุณาระบุเหตุผลก่อนบันทึกผลตรวจทาน');
      return;
    }
    setSubmittingId(item.id);
    setActionError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกผลตรวจทานไม่สำเร็จ');
      setMatches((current) => current.map((record) => record.id === item.id ? { ...record, status: decision, review_reason: reason } : record));
      setSuccess(decision === 'VERIFIED' ? 'ยืนยันความเชื่อมโยงพร้อมแหล่งอ้างอิงแล้ว' : 'ปฏิเสธข้อเสนอความเชื่อมโยงแล้ว');
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'บันทึกผลตรวจทานไม่สำเร็จ');
    } finally {
      setSubmittingId('');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <header className="hud-panel rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
            <Cpu className="h-3.5 w-3.5" />
            <span>Cross-Case Intelligence & Link Analysis</span>
          </div>
          <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
            <Link2 className="h-8 w-8 text-indigo-400" />
            ตรวจทานความเชื่อมโยงข้ามคดี
          </h1>
          <p className="max-w-2xl text-xs sm:text-sm text-slate-400">
            ทุกผลลัพธ์เป็นข้อเสนอ (Pending Candidate) จนกว่าผู้ตรวจทานจะยืนยันพร้อมเหตุผลและตรวจสอบแหล่งอ้างอิงจากหลักฐานต้นฉบับ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          <button
            type="button"
            onClick={() => void triggerScan()}
            disabled={isScanning || isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/20 border border-indigo-400/40 px-4 py-2.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/30 transition shadow-[0_0_15px_rgba(99,102,241,0.2)] disabled:opacity-50"
          >
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin text-indigo-300" /> : <Sparkles className="h-4 w-4 text-indigo-300" />}
            สแกนหาความเชื่อมโยง (AI & Fuzzy Scan)
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="secondary-action inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรชข้อมูล
          </button>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'PENDING', 'VERIFIED', 'EXACT', 'FUZZY'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilterType(tab)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              filterType === tab
                ? 'bg-teal-400/20 text-teal-200 border border-teal-400/40 shadow-[0_0_12px_rgba(45,212,191,0.2)]'
                : 'bg-slate-900/50 text-slate-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {tab === 'ALL' && `ทั้งหมด (${matches.length})`}
            {tab === 'PENDING' && `รอตรวจทาน (${matches.filter((m) => m.status === 'PENDING').length})`}
            {tab === 'VERIFIED' && `ยืนยันแล้ว (${matches.filter((m) => m.status === 'VERIFIED').length})`}
            {tab === 'EXACT' && 'Exact Match'}
            {tab === 'FUZZY' && 'Fuzzy Similarity (Trigram/AI)'}
          </button>
        ))}
      </div>

      {success && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm font-semibold text-emerald-300 flex items-center gap-3 shadow-[0_0_20px_rgba(52,211,153,0.1)]">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          {success}
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm font-semibold text-rose-300 flex items-center gap-3 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
          {actionError}
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel flex min-h-72 flex-col items-center justify-center rounded-3xl p-12 text-sm text-slate-400" role="status">
          <Loader2 className="h-8 w-8 text-teal-300 animate-spin mb-3" />
          <span className="font-mono text-xs tracking-wider">กำลังประมวลผลข้อเสนอความเชื่อมโยง...</span>
        </div>
      ) : loadError ? (
        <div className="rounded-3xl border border-rose-500/20 p-10 text-center" role="alert">
          <p className="text-sm text-rose-300">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center rounded-xl border border-rose-400/20 px-4 py-2 text-xs text-rose-200">
            <RefreshCw className="mr-2 h-4 w-4" />ลองใหม่
          </button>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="glass-panel rounded-3xl border border-dashed border-slate-800 py-20 text-center">
          <Link2 className="mx-auto h-12 w-12 text-slate-700 mb-3" />
          <p className="text-sm font-semibold text-slate-400">ไม่พบรายการความเชื่อมโยงในตัวกรองนี้</p>
          <p className="text-xs text-slate-600 mt-1">กดปุ่ม &ldquo;สแกนหาความเชื่อมโยง&rdquo; ด้านบนเพื่อทำการวิเคราะห์ข้ามคดี</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredMatches.map((item) => {
            const sourceCase = cases.find((record) => record.id === item.source_case_id);
            const targetCase = cases.find((record) => record.id === item.target_case_id);
            const pending = item.status === 'PENDING';
            const verified = item.status === 'VERIFIED';
            const isFuzzy = item.matching_signals && typeof item.matching_signals === 'object' && 'method' in item.matching_signals && item.matching_signals.method === 'TRIGRAM_FUZZY_SIMILARITY';

            return (
              <article key={item.id} className="hud-panel rounded-[28px] p-6 sm:p-7 border border-white/[0.08] hover:border-indigo-400/30 transition-all duration-300 shadow-[0_15px_40px_rgba(0,0,0,0.3)]">
                <div className="flex flex-col gap-6 xl:flex-row xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-5">
                    {/* Badge Strip */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <span className="cyber-badge cyber-badge-teal font-mono">
                        <Activity className="h-3 w-3" />
                        {typeLabels[item.entity_type] || item.entity_type}
                      </span>
                      {isFuzzy ? (
                        <span className="cyber-badge border border-amber-400/30 bg-amber-500/10 text-amber-300 font-mono">
                          FUZZY SIMILARITY: {(item.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="cyber-badge border border-indigo-400/30 bg-indigo-500/10 text-indigo-300 font-mono">
                          EXACT MATCH: {(item.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      <span className={`cyber-badge font-mono ${verified ? 'cyber-badge-teal' : pending ? 'cyber-badge-amber' : 'cyber-badge-rose'}`}>
                        STATUS: {item.status}
                      </span>
                    </div>

                    {/* Matched Target Value */}
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 block mb-1">
                        MATCHED ENTITY SIGNAL
                      </span>
                      <p className="break-words font-mono text-2xl font-black text-white tracking-wide text-teal-300 drop-shadow-[0_0_12px_rgba(45,212,191,0.3)]">
                        {item.entity_value}
                      </p>
                    </div>

                    {/* Dual Case Alignment Inspector */}
                    <div className="grid gap-4 rounded-2xl border border-white/[0.06] bg-slate-950/60 p-4 sm:grid-cols-2 relative">
                      <div className="space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                          SOURCE CASE (คดีต้นทาง)
                        </p>
                        <p className="text-sm font-bold text-slate-200">
                          {sourceCase ? `${sourceCase.number} — ${sourceCase.title}` : 'ไม่พบคดี'}
                        </p>
                      </div>
                      <div className="space-y-1 sm:border-l sm:border-white/[0.06] sm:pl-4">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          TARGET CASE (คดีเป้าหมาย)
                        </p>
                        <p className="text-sm font-bold text-slate-200">
                          {targetCase ? `${targetCase.number} — ${targetCase.title}` : 'ไม่พบคดี'}
                        </p>
                      </div>
                    </div>

                    {/* Source References */}
                    <div className="space-y-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <GitCompare className="h-3.5 w-3.5 text-teal-400" />
                        หลักฐานอ้างอิงและตำแหน่งที่ตรวจพบ (SOURCE EVIDENCE REFERENCES)
                      </p>
                      {item.sources?.length ? (
                        item.sources.map((source, index) => (
                          <div key={`${source.evidence_id}-${index}`} className="rounded-xl border border-white/[0.06] bg-slate-900/40 p-3.5 text-xs text-slate-300">
                            <span className="font-mono text-teal-300 font-bold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-500/20">
                              หน้า {source.page_number}
                            </span>
                            <p className="mt-2 whitespace-pre-wrap font-sans leading-relaxed text-slate-300">
                              {`"${source.source_text}"`}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                          <ShieldAlert className="h-4 w-4" />
                          ยังไม่มี source reference จึงยืนยันไม่ได้
                        </div>
                      )}
                    </div>

                    {item.entity_type === 'PERSON' && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-200">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>มาตรการความปลอดภัย: ฐานข้อมูลจะปฏิเสธการยืนยันชื่อบุคคลเพียงอย่างเดียว หากไม่มีสัญญาณสมทบ เช่น เบอร์โทร บัญชี หรือเลขเอกสาร</span>
                      </div>
                    )}
                  </div>

                  {/* Review Action Panel */}
                  {pending ? (
                    <div className="w-full space-y-3.5 xl:w-88 rounded-2xl border border-white/[0.08] bg-slate-900/50 p-5 self-start">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-300" />
                        <label htmlFor={`reason-${item.id}`} className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          บันทึกผลการตรวจทาน
                        </label>
                      </div>
                      <textarea
                        id={`reason-${item.id}`}
                        value={reasons[item.id] || ''}
                        onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                        rows={4}
                        maxLength={2000}
                        className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                        placeholder="ระบุเหตุผลและสัญญาณที่สอดคล้องกันเพื่อบันทึก Chain of Custody..."
                      />
                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          disabled={submittingId === item.id}
                          onClick={() => void review(item, 'DISMISSED')}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-900/40 disabled:opacity-50 transition"
                        >
                          <X className="h-4 w-4" />
                          ปฏิเสธ
                        </button>
                        <button
                          type="button"
                          disabled={submittingId === item.id || !item.sources?.length}
                          onClick={() => void review(item, 'VERIFIED')}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-400/40 bg-teal-500/20 px-3 py-2.5 text-xs font-bold text-teal-200 hover:bg-teal-500/30 disabled:opacity-50 transition shadow-[0_0_15px_rgba(45,212,191,0.2)]"
                        >
                          {submittingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          ยืนยันเชื่อมโยง
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full xl:w-72 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-2 self-start">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">
                        VERIFICATION LOG
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed italic">
                        {`"${item.review_reason || 'ไม่มีบันทึกเหตุผล'}"`}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

