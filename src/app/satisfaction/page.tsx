'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, BarChart3, ClipboardCheck, FlaskConical, Gauge, Lightbulb, Loader2, MessageSquareText, RefreshCw, ShieldCheck, Sparkles, Star, Target, TrendingUp, UsersRound } from 'lucide-react';
import type { SatisfactionSummary } from '@/lib/satisfaction-contract';

const dimensionLabels = {
  convenience: { label: 'ความสะดวก', description: 'ขั้นตอน เมนู และความเข้าใจง่าย' },
  speed: { label: 'ความรวดเร็ว', description: 'การตอบสนองและระยะเวลาทำรายการ' },
  accuracy: { label: 'ความแม่นยำ', description: 'ความตรงตามความต้องการของผลลัพธ์' },
  overall: { label: 'ความพึงพอใจรวม', description: 'ประสบการณ์ใช้งานในภาพรวม' },
} as const;

const contextLabels = {
  PUBLIC_SEARCH: 'ประชาชน · หลังค้นหาข้อมูล',
  PUBLIC_COMPLAINT: 'ประชาชน · หลังแจ้งเรื่อง',
  STAFF_SESSION: 'เจ้าหน้าที่ · หลังใช้งานระบบ',
} as const;

const pdcaDimensionGuidance = {
  convenience: {
    label: 'ความสะดวก',
    action: 'ทบทวนจำนวนขั้นตอน โครงสร้างเมนู และจุดที่ผู้ใช้ต้องย้อนกลับ เพื่อทำให้ flow หลักสั้นและชัดขึ้น',
  },
  speed: {
    label: 'ความรวดเร็ว',
    action: 'ตรวจช่วงค้นหา เปิดรายการ และเปลี่ยนหน้า เพื่อหาคอขวดที่ทำให้ผู้ใช้เข้าถึงข้อมูลช้า',
  },
  accuracy: {
    label: 'ความถูกต้อง',
    action: 'ทบทวนความครบถ้วนของผลลัพธ์ แหล่งอ้างอิง และจุดตรวจยืนยันโดยเจ้าหน้าที่ก่อนนำข้อมูลไปใช้',
  },
} as const;

function StarRating({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${label} ${value.toFixed(1)} จาก 5 ดาว`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={`h-5 w-5 ${index + 0.5 <= value ? 'fill-amber-300 text-amber-300' : 'text-slate-700'}`} />
      ))}
    </div>
  );
}

function formatThaiDateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : 'ยังไม่มีข้อมูล';
}

function R2RResearchSection({ summary }: { summary: SatisfactionSummary }) {
  const research = summary.research;
  if (!research) {
    return (
      <section className="hud-panel rounded-3xl border border-dashed border-white/[0.1] p-6 sm:p-7" aria-label="ผลงานวิจัย R2R">
        <div className="flex items-start gap-3"><FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" /><div><h2 className="text-base font-black text-white">ผลงานวิจัย R2R</h2><p className="mt-1 text-xs leading-6 text-slate-400">โครงสร้างสถิติวิจัยพร้อมแล้ว แต่ฐานข้อมูลยังไม่ได้ใช้ฟังก์ชันสรุปรุ่นล่าสุด กรุณารัน migration แล้วรีเฟรชอีกครั้ง</p></div></div>
      </section>
    );
  }

  const sampleProgress = Math.min(100, Math.round((summary.totalResponses / research.targetSampleSize) * 100));
  const weakest = research.weakestDimension ? pdcaDimensionGuidance[research.weakestDimension] : null;
  const distribution = (['1', '2', '3', '4', '5'] as const).map((score) => ({ score, count: research.ratingDistribution[score] }));
  const maxDistribution = Math.max(1, ...distribution.map((entry) => entry.count));
  const alphaInterpretation = research.cronbachAlpha === null
    ? `รอฐานข้อมูลอย่างน้อย ${research.targetSampleSize} คำตอบ`
    : research.cronbachAlpha >= 0.7
      ? 'ความสอดคล้องภายในผ่านเกณฑ์เบื้องต้น'
      : 'ควรทบทวนความสอดคล้องของชุดคำถาม';
  const pdcaCards = [
    {
      phase: 'PLAN',
      title: 'กำหนดฐานรอบแรก',
      description: `ใช้ ${research.targetSampleSize} คำตอบแรกเป็น baseline ของระบบใหม่ โดยไม่สร้างข้อมูลก่อนใช้ระบบย้อนหลัง`,
      icon: Target,
      tone: 'text-sky-200 border-sky-300/20 bg-sky-300/[0.06]',
    },
    {
      phase: 'DO',
      title: 'เก็บข้อมูลจากงานจริง',
      description: `รับคำตอบแล้ว ${summary.totalResponses} รายการ จาก ${summary.contexts.length} จังหวะใช้งาน และสรุปใหม่อัตโนมัติทุก 30 วินาที`,
      icon: ClipboardCheck,
      tone: 'text-cyan-200 border-cyan-300/20 bg-cyan-300/[0.06]',
    },
    {
      phase: 'CHECK',
      title: 'ตรวจผลอย่างโปร่งใส',
      description: weakest
        ? `มิติที่ควรเฝ้าดูก่อนคือ “${weakest.label}” คะแนน ${summary.dimensions[research.weakestDimension!].averageRating.toFixed(1)}/5`
        : 'กำลังรอคำตอบแรกเพื่อระบุมิติที่ควรเฝ้าดู',
      icon: BarChart3,
      tone: 'text-violet-200 border-violet-300/20 bg-violet-300/[0.06]',
    },
    {
      phase: 'ACT',
      title: 'แปลงผลเป็นงานปรับปรุง',
      description: weakest ? weakest.action : 'เริ่มจัดลำดับงานปรับปรุงเมื่อมีข้อมูลจากผู้ใช้จริง โดยให้เจ้าหน้าที่ทบทวนก่อนดำเนินการ',
      icon: Lightbulb,
      tone: 'text-amber-200 border-amber-300/20 bg-amber-300/[0.06]',
    },
  ];

  return (
    <section className="glass-panel relative overflow-hidden rounded-[30px] border border-cyan-300/15 p-5 sm:p-7 lg:p-8" aria-labelledby="r2r-research-title">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/[0.06] blur-3xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200"><FlaskConical className="h-3.5 w-3.5" /> Routine to Research · PDCA cycle 1</span>
            <h2 id="r2r-research-title" className="mt-4 text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">ผลงานวิจัย R2R จากการใช้งานจริง</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">คำถามวิจัย: ระบบ LawiRisk-SSK ช่วยให้ผู้ใช้เข้าถึงข้อมูลได้สะดวก รวดเร็ว และได้รับผลลัพธ์ที่ตรงความต้องการเพียงใด?</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs text-emerald-100">
            <p className="flex items-center gap-2 font-bold"><Activity className={`h-4 w-4 ${research.baselineStatus === 'FORMING' ? 'animate-pulse motion-reduce:animate-none' : ''}`} />ผลลัพธ์ใกล้เคียงเรียลไทม์</p>
            <p className="mt-1 font-mono text-[9px] text-emerald-200/65">อัปเดต {formatThaiDateTime(research.generatedAt)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/[0.07] bg-slate-950/45 p-4">
            <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/[0.08] text-cyan-200"><UsersRound className="h-4 w-4" /></span><span className="font-mono text-[9px] text-slate-500">BASELINE</span></div>
            <p className="mt-4 text-2xl font-black text-white">{summary.totalResponses}<span className="text-sm font-medium text-slate-500"> / {research.targetSampleSize}</span></p>
            <p className="mt-1 text-[11px] text-slate-400">จำนวนตัวอย่างรอบนำร่อง</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${sampleProgress}%` }} /></div>
          </article>
          <article className="rounded-2xl border border-white/[0.07] bg-slate-950/45 p-4">
            <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300/[0.08] text-emerald-200"><TrendingUp className="h-4 w-4" /></span><span className="font-mono text-[9px] text-slate-500">POSITIVE</span></div>
            <p className="mt-4 text-2xl font-black text-white">{research.positiveResponsePercent}%</p>
            <p className="mt-1 text-[11px] text-slate-400">ผู้ตอบที่ให้คะแนนรวม 4–5 ดาว</p>
          </article>
          <article className="rounded-2xl border border-white/[0.07] bg-slate-950/45 p-4">
            <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-300/[0.08] text-sky-200"><ShieldCheck className="h-4 w-4" /></span><span className="font-mono text-[9px] text-slate-500">95% CI</span></div>
            <p className="mt-4 text-lg font-black text-white">{research.confidence95 ? `${research.confidence95.lower.toFixed(2)}–${research.confidence95.upper.toFixed(2)}` : 'รอ n ≥ 30'}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">ช่วงประมาณของคะแนนเฉลี่ย 95%</p>
          </article>
          <article className="rounded-2xl border border-white/[0.07] bg-slate-950/45 p-4">
            <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200"><BarChart3 className="h-4 w-4" /></span><span className="font-mono text-[9px] text-slate-500">RELIABILITY</span></div>
            <p className="mt-4 text-lg font-black text-white">{research.cronbachAlpha === null ? 'รอ n ≥ 30' : `α = ${research.cronbachAlpha.toFixed(2)}`}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">{alphaInterpretation}</p>
          </article>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <article className="rounded-3xl border border-white/[0.07] bg-slate-950/35 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-white">การกระจายคะแนนรวม</h3><p className="mt-1 text-[11px] text-slate-500">จำนวนคำตอบจริงแยกตามระดับ 1–5 ดาว</p></div><Gauge className="h-5 w-5 text-amber-200" /></div>
            <div className="mt-6 grid h-36 grid-cols-5 items-end gap-2" aria-label="การกระจายคะแนนรวม">
              {distribution.map(({ score, count }) => (
                <div key={score} className="flex h-full flex-col items-center justify-end gap-2">
                  <span className="font-mono text-[10px] font-bold text-slate-400">{count}</span>
                  <span className="w-full rounded-t-lg bg-gradient-to-t from-cyan-500/50 to-teal-300" style={{ height: `${Math.max(4, (count / maxDistribution) * 100)}%` }} />
                  <span className="text-[10px] font-bold text-slate-500">{score} ★</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/[0.07] bg-slate-950/35 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-black text-white">วงจรพัฒนาคุณภาพ PDCA</h3><p className="mt-1 text-[11px] text-slate-500">เปลี่ยนเสียงผู้ใช้เป็นงานปรับปรุงที่ติดตามได้</p></div><span className={`rounded-full border px-3 py-1 font-mono text-[9px] font-bold ${research.baselineStatus === 'READY' ? 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200' : 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200'}`}>{research.baselineStatus === 'READY' ? 'BASELINE READY' : 'FORMING BASELINE'}</span></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {pdcaCards.map(({ phase, title, description, icon: Icon, tone }) => (
                <div key={phase} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="font-mono text-[9px] font-black tracking-[0.12em]">{phase}</span></div>
                  <h4 className="mt-3 text-xs font-black text-white">{title}</h4>
                  <p className="mt-1 text-[10px] leading-5 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl border border-white/[0.07] bg-black/15 p-4 text-[10px] leading-5 text-slate-500 sm:grid-cols-3">
          <p><span className="font-bold text-slate-300">แหล่งข้อมูล:</span> แบบประเมิน 4 มิติจากประชาชนและเจ้าหน้าที่ ช่วง {formatThaiDateTime(research.collectionPeriod.from)} ถึง {formatThaiDateTime(research.collectionPeriod.to)}</p>
          <p><span className="font-bold text-slate-300">หลักสถิติ:</span> รายงาน n, ค่าเฉลี่ย, สัดส่วน 4–5 ดาว, ช่วงประมาณ 95% และ Cronbach&apos;s alpha เมื่อ n ≥ {research.targetSampleSize}</p>
          <p><span className="font-bold text-slate-300">ข้อจำกัด:</span> เป็นผลลัพธ์จากการรับรู้ของผู้ใช้ ไม่ใช่เวลาประมวลผลจริง และยังสรุปเหตุ–ผลไม่ได้ จึงต้องใช้ร่วมกับข้อมูลระบบและการทบทวนโดยมนุษย์</p>
        </div>
      </div>
    </section>
  );
}

async function fetchSatisfactionSummary(signal?: AbortSignal): Promise<SatisfactionSummary> {
  const response = await fetch('/api/v1/satisfaction', { credentials: 'same-origin', cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'โหลดสถิติความพึงพอใจไม่สำเร็จ');
  return body.data as SatisfactionSummary;
}

export default function SatisfactionDashboardPage() {
  const [summary, setSummary] = useState<SatisfactionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async (silent = false, signal?: AbortSignal) => {
    if (silent) setIsRefreshing(true); else setIsLoading(true);
    if (!silent) setError('');
    try {
      setSummary(await fetchSatisfactionSummary(signal));
      setError('');
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'โหลดสถิติความพึงพอใจไม่สำเร็จ');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSatisfactionSummary(controller.signal)
      .then((data) => { setSummary(data); setError(''); })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'โหลดสถิติความพึงพอใจไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    const timer = window.setInterval(() => void loadSummary(true), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [loadSummary]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="glass-panel relative overflow-hidden rounded-[30px] border border-white/[0.08] p-6 sm:p-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-amber-300/[0.07] blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200"><Sparkles className="h-3.5 w-3.5" /> Voice of users</span>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">ภาพรวมความพึงพอใจของผู้ใช้งาน</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">ติดตามคะแนนจากประชาชนและเจ้าหน้าที่ใน 4 มิติ เพื่อนำข้อค้นพบไปจัดลำดับการพัฒนาระบบอย่างเป็นรูปธรรม</p>
          </div>
          <button type="button" onClick={() => void loadSummary(true)} disabled={isLoading || isRefreshing} className="secondary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-bold text-slate-300 disabled:opacity-50">
            {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} รีเฟรชสถิติ
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSummary()} className="rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-bold">ลองใหม่</button>
        </div>
      )}

      {isLoading && !summary ? (
        <div className="grid gap-4 md:grid-cols-3" aria-label="กำลังโหลดสถิติ">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="hud-panel h-44 animate-pulse rounded-3xl bg-white/[0.03] motion-reduce:animate-none" />)}
        </div>
      ) : summary ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]" aria-label="คะแนนความพึงพอใจรวมและแยกกลุ่ม">
            <article className="hud-panel relative overflow-hidden rounded-3xl border border-amber-300/20 p-6 sm:p-7">
              <div className="absolute -bottom-20 -right-16 h-48 w-48 rounded-full bg-amber-300/[0.07] blur-3xl" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200"><Gauge className="h-5 w-5" /></span><span className="rounded-full border border-white/[0.08] px-3 py-1 font-mono text-[10px] text-slate-400">รวม {summary.totalResponses} คำตอบ</span></div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">คะแนนความพึงพอใจรวม</p>
                <div className="mt-2 flex flex-wrap items-end gap-3"><span className="text-5xl font-black tracking-tight text-white">{summary.averageRating.toFixed(1)}</span><span className="pb-1 text-sm text-slate-500">/ 5 ดาว</span><span className="mb-1 rounded-xl bg-emerald-300/[0.1] px-3 py-1 text-xs font-black text-emerald-300">เทียบคะแนนเต็ม {summary.satisfactionPercent}%</span></div>
                <div className="mt-4"><StarRating value={summary.averageRating} label="คะแนนความพึงพอใจรวม" /></div>
              </div>
            </article>

            {([
              { key: 'PUBLIC' as const, title: 'ประชาชน', description: 'หลังค้นหาหรือแจ้งเรื่อง', icon: UsersRound, tone: 'text-cyan-300', surface: 'border-cyan-300/20 bg-cyan-300/[0.06]' },
              { key: 'STAFF' as const, title: 'เจ้าหน้าที่', description: 'หลังใช้งานเครื่องมือ', icon: BarChart3, tone: 'text-violet-300', surface: 'border-violet-300/20 bg-violet-300/[0.06]' },
            ]).map(({ key, title, description, icon: Icon, tone, surface }) => {
              const segment = summary.audiences[key];
              return (
                <article key={key} className={`rounded-3xl border p-6 ${surface}`}>
                  <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl border border-current/20 ${tone}`}><Icon className="h-5 w-5" /></span><div><h2 className="text-sm font-bold text-white">{title}</h2><p className="text-[11px] text-slate-500">{description}</p></div></div>
                  <div className="mt-6 flex items-end justify-between gap-3"><span className="text-3xl font-black text-white">{segment.averageRating.toFixed(1)} <small className="text-xs font-medium text-slate-500">ดาว</small></span><span className={`text-xs font-black ${tone}`}>เทียบเต็ม {segment.satisfactionPercent}%</span></div>
                  <div className="mt-3"><StarRating value={segment.averageRating} label={`คะแนน${title}`} /></div>
                  <p className="mt-4 font-mono text-[10px] text-slate-500">{segment.totalResponses} คำตอบ</p>
                </article>
              );
            })}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <article className="hud-panel rounded-3xl p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-white">คะแนนรายมิติ</h2><p className="mt-1 text-xs text-slate-500">ค่าเฉลี่ยจากผู้ตอบทุกกลุ่ม เทียบเป็นเปอร์เซ็นต์เต็ม 100</p></div><BarChart3 className="h-5 w-5 text-teal-300" /></div>
              <div className="mt-6 space-y-5">
                {(Object.keys(dimensionLabels) as Array<keyof typeof dimensionLabels>).map((key) => {
                  const dimension = summary.dimensions[key];
                  return (
                    <div key={key}>
                      <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-200">{dimensionLabels[key].label}</h3><p className="mt-0.5 text-[11px] text-slate-500">{dimensionLabels[key].description}</p></div><span className="font-mono text-sm font-black text-teal-200">{dimension.averageRating.toFixed(1)}/5 · {dimension.satisfactionPercent}%</span></div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-950" role="progressbar" aria-label={`${dimensionLabels[key].label} ${dimension.satisfactionPercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={dimension.satisfactionPercent}><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-300" style={{ width: `${dimension.satisfactionPercent}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="hud-panel rounded-3xl p-6 sm:p-7">
              <h2 className="text-base font-black text-white">แยกตามจังหวะใช้งาน</h2>
              <p className="mt-1 text-xs text-slate-500">ช่วยระบุว่าควรปรับปรุง flow ใดก่อน</p>
              <div className="mt-5 space-y-3">
                {summary.contexts.length ? summary.contexts.map((context) => (
                  <div key={context.context} className="rounded-2xl border border-white/[0.07] bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-200">{contextLabels[context.context]}</span><span className="font-mono text-xs font-black text-amber-200">{context.averageRating.toFixed(1)} ★</span></div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500"><span>{context.totalResponses} คำตอบ</span><span>เทียบเต็ม {context.satisfactionPercent}%</span></div>
                  </div>
                )) : <div className="rounded-2xl border border-dashed border-white/[0.1] p-8 text-center text-xs text-slate-500">ยังไม่มีคำตอบในช่วงนี้</div>}
              </div>
            </article>
          </section>

          <section className="hud-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/[0.07] text-violet-200"><MessageSquareText className="h-5 w-5" /></span><div><h2 className="text-base font-black text-white">ข้อเสนอแนะล่าสุด</h2><p className="mt-1 text-xs text-slate-500">แสดงเฉพาะข้อความที่ผู้ตอบเลือกส่ง ไม่แสดงชื่อหรือข้อมูลการค้นหา</p></div></div>
            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {summary.recentSuggestions.length ? summary.recentSuggestions.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-white/[0.07] bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${entry.audience === 'PUBLIC' ? 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200' : 'border-violet-300/20 bg-violet-300/[0.06] text-violet-200'}`}>{contextLabels[entry.context]}</span><time className="font-mono text-[9px] text-slate-600" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</time></div>
                  <p className="mt-3 break-words text-xs leading-6 text-slate-300">{entry.suggestion}</p>
                </article>
              )) : <div className="col-span-full rounded-2xl border border-dashed border-white/[0.1] p-10 text-center text-xs text-slate-500">ยังไม่มีข้อเสนอแนะข้อความ</div>}
            </div>
          </section>

          <R2RResearchSection summary={summary} />
        </>
      ) : null}
    </div>
  );
}
