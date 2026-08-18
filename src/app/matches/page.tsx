'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Link2, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { Case, MatchCandidate } from '@/lib/demo-data';

type MatchSource = { evidence_id: string; page_number: number; source_text: string };
type MatchRecord = MatchCandidate & {
  matching_signals?: Record<string, unknown>;
  review_reason?: string | null;
  sources?: MatchSource[];
};

const typeLabels: Record<string, string> = {
  PERSON: 'บุคคล', ORGANIZATION: 'องค์กร', PHONE: 'เบอร์โทรศัพท์', EMAIL: 'อีเมล',
  BANK_ACCOUNT: 'บัญชีธนาคาร', CITIZEN_ID: 'เลขบัตรประชาชน', LOCATION: 'สถานที่',
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

  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve();
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
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
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
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-white"><Link2 className="h-8 w-8 text-indigo-500" />ตรวจทานความเชื่อมโยงข้ามคดี</h1>
        <p className="mt-2 text-slate-400">ทุกผลลัพธ์เป็นข้อเสนอจนกว่าผู้ตรวจทานจะยืนยันพร้อมเหตุผลและแหล่งอ้างอิงจากหลักฐานต้นฉบับ</p>
      </header>

      {success && <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">{success}</div>}
      {actionError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{actionError}</div>}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-900 text-sm text-slate-400" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดข้อเสนอ...</div>
      ) : loadError ? (
        <div className="rounded-3xl border border-rose-500/20 p-10 text-center" role="alert"><p className="text-sm text-rose-300">{loadError}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center rounded-xl border border-rose-400/20 px-4 py-2 text-xs text-rose-200"><RefreshCw className="mr-2 h-4 w-4" />ลองใหม่</button></div>
      ) : matches.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 py-20 text-center"><Link2 className="mx-auto h-12 w-12 text-slate-700" /><p className="mt-4 text-sm text-slate-500">ยังไม่มีข้อเสนอความเชื่อมโยงที่เข้าถึงได้</p></div>
      ) : (
        <div className="space-y-5">
          {matches.map((item) => {
            const sourceCase = cases.find((record) => record.id === item.source_case_id);
            const targetCase = cases.find((record) => record.id === item.target_case_id);
            const pending = item.status === 'PENDING';
            return (
              <article key={item.id} className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-indigo-300">{typeLabels[item.entity_type] || item.entity_type}</span><span className="text-slate-500">ความเชื่อมั่น {(item.confidence * 100).toFixed(0)}%</span><span className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300">{item.status}</span></div>
                    <p className="break-words text-xl font-bold text-white">{item.entity_value}</p>
                    <div className="grid gap-3 rounded-2xl border border-slate-900 bg-slate-950/50 p-4 sm:grid-cols-2"><div><p className="text-[10px] uppercase text-slate-600">คดีต้นทาง</p><p className="mt-1 text-sm text-slate-300">{sourceCase ? `${sourceCase.number} — ${sourceCase.title}` : 'ไม่พบคดี'}</p></div><div><p className="text-[10px] uppercase text-slate-600">คดีเป้าหมาย</p><p className="mt-1 text-sm text-slate-300">{targetCase ? `${targetCase.number} — ${targetCase.title}` : 'ไม่พบคดี'}</p></div></div>
                    <div className="space-y-2"><p className="text-xs font-semibold text-slate-400">แหล่งอ้างอิง</p>{item.sources?.length ? item.sources.map((source, index) => <div key={`${source.evidence_id}-${index}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-slate-400"><span className="font-mono text-teal-300">หน้า {source.page_number}</span><p className="mt-1 whitespace-pre-wrap">{source.source_text}</p></div>) : <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200"><ShieldAlert className="h-4 w-4" />ยังไม่มี source reference จึงยืนยันไม่ได้</div>}</div>
                    {item.entity_type === 'PERSON' && <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />ฐานข้อมูลจะปฏิเสธการยืนยันชื่อบุคคลเพียงอย่างเดียว หากไม่มีสัญญาณสมทบ เช่น เบอร์โทร บัญชี หรือเลขเอกสาร</div>}
                  </div>
                  {pending && <div className="w-full space-y-3 xl:w-80"><label htmlFor={`reason-${item.id}`} className="text-xs font-semibold text-slate-300">เหตุผลของผู้ตรวจทาน</label><textarea id={`reason-${item.id}`} value={reasons[item.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} rows={4} maxLength={2000} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" placeholder="อธิบายสัญญาณและแหล่งอ้างอิงที่ตรวจแล้ว" /><div className="flex gap-2"><button type="button" disabled={submittingId === item.id} onClick={() => void review(item, 'DISMISSED')} className="flex flex-1 items-center justify-center rounded-xl border border-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-300 disabled:opacity-50"><X className="mr-1 h-4 w-4" />ปฏิเสธ</button><button type="button" disabled={submittingId === item.id || !item.sources?.length} onClick={() => void review(item, 'VERIFIED')} className="flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{submittingId === item.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}ยืนยัน</button></div></div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
