'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  Database,
  FileCheck2,
  Fingerprint,
  Inbox,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { IntakeEnvelope } from '@/lib/demo-data';

const urgencyStyle: Record<string, string> = {
  CRITICAL: 'border-rose-400/30 bg-rose-500/15 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
  HIGH: 'border-amber-300/30 bg-amber-400/15 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.2)]',
  NORMAL: 'border-sky-300/25 bg-sky-400/10 text-sky-200',
  LOW: 'border-slate-400/20 bg-slate-400/[0.07] text-slate-300',
};

const urgencyLabel: Record<string, string> = {
  CRITICAL: 'วิกฤต (CRITICAL)',
  HIGH: 'เร่งด่วน (HIGH)',
  NORMAL: 'ปกติ (NORMAL)',
  LOW: 'เฝ้าระวัง (LOW)',
};

export default function NationalCommandCenter() {
  const [counts, setCounts] = useState({ intake: 0, cases: 0, evidence: 0, entities: 0, audit: 0 });
  const [queue, setQueue] = useState<IntakeEnvelope[]>([]);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/dashboard', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดภาพรวมระบบไม่สำเร็จ');
        setCounts(body.data.counts);
        setQueue(body.data.queue as IntakeEnvelope[]);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setLoadError(caught instanceof Error ? caught.message : 'โหลดภาพรวมระบบไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const stats = [
    { label: 'เรื่องร้องเรียนและเบาะแส', value: counts.intake, unit: 'เรื่อง', hint: 'รอการคัดกรองความปลอดภัย', href: '/intake', icon: Inbox, tone: 'text-teal-300', surface: 'bg-teal-300/[0.1] border-teal-300/20' },
    { label: 'สำนวนคดีที่ดำเนินการ', value: counts.cases, unit: 'สำนวน', hint: 'สำนวนในความรับผิดชอบ', href: '/cases', icon: BriefcaseBusiness, tone: 'text-sky-300', surface: 'bg-sky-300/[0.1] border-sky-300/20' },
    { label: 'หลักฐานดิจิทัลในคลัง', value: counts.evidence, unit: 'ไฟล์', hint: 'เข้ารหัส SHA-256 ครบถ้วน', href: '/evidence', icon: Fingerprint, tone: 'text-amber-200', surface: 'bg-amber-300/[0.1] border-amber-300/20' },
    { label: 'ข้อมูลบุคคลและนิติบุคคล', value: counts.entities, unit: 'รายการ', hint: `${counts.audit} รายการประวัติการใช้งาน`, href: '/entities', icon: Database, tone: 'text-violet-300', surface: 'bg-violet-300/[0.1] border-violet-300/20' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-8">
      {/* Live System Broadcast Ticker */}
      <div className="hud-panel flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-4 py-3 text-xs sm:gap-3 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
          <span className="shrink-0 font-mono text-[10px] font-bold tracking-wider text-emerald-300 sm:text-xs">SYSTEM: ONLINE</span>
          <span className="hidden h-3 w-px bg-slate-700 sm:inline-block" />
          <span className="truncate text-[11px] text-slate-400 sm:text-xs">ระบบรักษาความมั่นคงปลอดภัยพร้อมใช้งาน</span>
        </div>
        <div className="flex w-full items-center justify-between gap-2 border-t border-white/[0.05] pt-2 font-mono text-[9px] text-slate-500 sm:w-auto sm:justify-start sm:border-0 sm:pt-0 sm:text-[11px]">
          <Activity className="h-3.5 w-3.5 text-teal-400" />
          <span>LATENCY: 18ms</span>
          <span className="text-slate-700">|</span>
          <span>INTEGRITY: 100%</span>
        </div>
      </div>

      {loadError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{loadError}</div>}

      {/* Main Mission Control Hero */}
      <section className="glass-panel relative isolate overflow-hidden rounded-[28px] border border-white/[0.08] p-5 sm:min-h-[380px] sm:rounded-[32px] sm:p-8 lg:flex lg:items-center lg:p-12">
        <div className="scan-line absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-teal-200/50 to-transparent" aria-hidden="true" />
        <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full bg-sky-400/[0.06] blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-40 right-20 h-96 w-96 rounded-full bg-teal-300/[0.07] blur-3xl" aria-hidden="true" />
        
        {/* Animated Cyber Radar HUD */}
        <div className="absolute bottom-0 right-0 hidden h-full w-[45%] overflow-hidden lg:block" aria-hidden="true">
          <div className="absolute right-[12%] top-1/2 -translate-y-1/2">
            <div className="signal-radar grid h-72 w-72 place-items-center xl:h-80 xl:w-80 border border-teal-300/20 shadow-[0_0_50px_rgba(66,232,206,0.08)]">
              <div className="absolute inset-[15%] rounded-full border border-teal-200/[0.1] border-dashed animate-[spin_30s_linear_infinite]" />
              <div className="absolute inset-[32%] rounded-full border border-teal-200/[0.15]" />
              <div className="absolute inset-[50%] rounded-full border border-teal-200/[0.2]" />
              <Radar className="h-16 w-16 text-teal-200/[0.15]" />
              <span className="absolute left-[26%] top-[28%] h-2 w-2 rounded-full bg-teal-300 shadow-[0_0_16px_rgba(94,234,212,0.9)] animate-ping" />
              <span className="absolute bottom-[30%] right-[22%] h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.8)]" />
              <span className="absolute top-[40%] right-[35%] h-1 w-1 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
            </div>
          </div>
          <div className="absolute bottom-6 right-8 flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#07131f]/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200/80 backdrop-blur-xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <span className="status-pulse h-2 w-2 rounded-full bg-teal-300 text-teal-300" />
            <span>CHAIN OF CUSTODY · ENFORCED</span>
          </div>
        </div>

        <div className="relative z-10 max-w-3xl lg:max-w-[60%]">
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.08] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-teal-200 shadow-[0_0_20px_rgba(66,232,206,0.1),inset_0_1px_rgba(255,255,255,0.1)] sm:mb-6 sm:gap-2.5 sm:px-4 sm:text-[10px] sm:tracking-[0.2em]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" />
            <span>ความสมบูรณ์ของหลักฐานดิจิทัล (Evidence Integrity)</span>
          </div>
          <h1 className="text-balance text-[28px] font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-4xl sm:leading-[1.15] lg:text-[46px] xl:text-[50px]">
            ระบบสืบสวนและเชื่อมโยง<br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-teal-200 via-cyan-100 to-amber-200 bg-clip-text text-transparent">พยานหลักฐานดิจิทัลคดีความมั่นคง</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-6 text-slate-400 sm:mt-5 sm:text-[15px] sm:leading-7">
            ระบบช่วยจัดระเบียบสำนวนคดี ตรวจจับความซ้ำซ้อน สกัดข้อมูลความสัมพันธ์ และตรวจสอบความเชื่อมโยงข้ามพื้นที่ โดยข้อสรุปทุกรายการต้องสามารถตรวจสอบย้อนกลับถึงหลักฐานต้นฉบับได้
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-3">
            <Link href="/intake" className="primary-action inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold shadow-[0_0_25px_rgba(66,232,206,0.25)] sm:w-auto sm:px-6">
              <Zap className="h-4 w-4" /> รายการรับเรื่องและคัดกรอง <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link href="/review" className="secondary-action inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.1] px-5 text-sm font-semibold hover:border-amber-400/30 sm:w-auto sm:px-6">
              <Sparkles className="h-4 w-4 text-amber-300" /> ผลการวิเคราะห์และตรวจทาน
            </Link>
            <Link href="/matches" className="secondary-action inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] px-5 text-sm font-semibold hover:border-indigo-400/30 sm:w-auto">
              <Cpu className="h-4 w-4 text-indigo-300" /> การวิเคราะห์ความเชื่อมโยง
            </Link>
          </div>
        </div>
      </section>

      {/* Cyber Metric Tiles */}
      <section aria-label="ตัวชี้วัดสำคัญ" className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="soft-panel interactive-card group rounded-[20px] border border-white/[0.06] p-4 hover:border-teal-300/30 sm:rounded-[24px] sm:p-5">
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <span className={`grid h-10 w-10 place-items-center rounded-[14px] border sm:h-12 sm:w-12 sm:rounded-[16px] ${stat.surface} ${stat.tone} shadow-[0_0_15px_rgba(0,0,0,0.2)]`}>
                  <Icon className="h-5 w-5 transition-transform duration-500 group-hover:scale-115" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-600 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-teal-200" />
              </div>
              <p className="mt-4 min-h-10 text-[11px] font-semibold leading-5 text-slate-400 sm:mt-5 sm:min-h-0 sm:text-xs sm:uppercase sm:tracking-wider">{stat.label}</p>
              <p className="mt-1 flex min-h-9 items-baseline gap-2">
                {isLoading ? (
                  <span className="skeleton-shimmer h-8 w-20 rounded-lg" />
                ) : (
                  <>
                    <span key={stat.value} className="metric-value text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{stat.value}</span>
                    <span className="text-xs font-medium text-slate-500">{stat.unit}</span>
                  </>
                )}
              </p>
              <p className="mt-2 hidden items-center justify-between border-t border-white/[0.04] pt-2 text-[11px] text-slate-500 sm:mt-3 sm:flex">
                <span>{stat.hint}</span>
                <span className="font-mono text-[9px] text-teal-400/70 group-hover:text-teal-300">EXPLORE →</span>
              </p>
            </Link>
          );
        })}
      </section>

      {/* Priority Queue & System Governance */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.8fr)]">
        <div className="glass-panel overflow-hidden rounded-[28px] border border-white/[0.06]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-amber-300" />
                <h2 className="text-base font-bold text-white">คิวคำร้องที่ต้องดำเนินการ (Priority Queue)</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">เรียงตามระดับความสำคัญและสถานะการตรวจสอบความปลอดภัย</p>
            </div>
            <Link href="/intake" className="inline-flex items-center gap-1 text-xs font-bold text-teal-300 hover:text-teal-200">
              ดูคิวทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {isLoading ? (
              [0, 1, 2].map((item) => (
                <div key={item} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 px-5 py-4 sm:grid-cols-[40px_minmax(0,1fr)_80px] sm:items-center sm:px-6 sm:py-5">
                  <span className="skeleton-shimmer h-10 w-10 rounded-xl" />
                  <span className="space-y-2">
                    <span className="skeleton-shimmer block h-3 w-24 rounded" />
                    <span className="skeleton-shimmer block h-4 w-3/4 rounded" />
                  </span>
                  <span className="skeleton-shimmer hidden h-4 w-16 rounded sm:block" />
                </div>
              ))
            ) : queue.length ? (
              queue.slice(0, 4).map((item, index) => (
                <Link
                  key={item.id}
                  href={`/intake/${item.id}`}
                  className="group relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-3 px-5 py-4 transition duration-300 hover:bg-white/[0.03] sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-6 sm:py-5"
                >
                  <span className="absolute inset-y-3 left-0 w-1 scale-y-0 rounded-r bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.8)] transition-transform duration-300 group-hover:scale-y-100" aria-hidden="true" />
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-slate-900/60 font-mono text-xs font-bold text-slate-400 group-hover:border-teal-300/30 group-hover:text-teal-300">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-lg border px-2.5 py-0.5 text-[9px] font-bold ${urgencyStyle[item.urgency]}`}>
                        {urgencyLabel[item.urgency]}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500">{item.jurisdiction_agency || 'ยังไม่กำหนดหน่วยงาน'}</span>
                    </span>
                    <span className="mt-2 block truncate text-sm font-semibold text-slate-200 group-hover:text-white">
                      {item.urgency_reason || 'รอตรวจรายละเอียดคำร้อง'}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] text-slate-500">
                      ID: {item.id} · รับเมื่อ {new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </span>
                  <span className="col-start-2 inline-flex w-fit items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs font-bold text-slate-300 transition group-hover:border-teal-400/30 group-hover:bg-teal-400/10 group-hover:text-teal-200 sm:col-auto sm:w-auto">
                    ตรวจสอบ <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))
            ) : (
              <div className="px-5 py-12 text-center text-sm text-slate-500 sm:px-6 sm:py-14">ไม่มีรายการรอคัดกรองที่เข้าถึงได้ในขณะนี้</div>
            )}
          </div>
        </div>

        {/* Chain of Custody & Assurance Box */}
        <div className="hud-panel space-y-5 rounded-[24px] p-5 sm:space-y-6 sm:rounded-[28px] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center">
                <ShieldCheck className="mr-2 h-5 w-5 text-emerald-400" />
                ความพร้อมของสายการควบคุม
              </h2>
              <p className="mt-1 text-xs text-slate-400">มาตรการควบคุมความถูกต้อง 100%</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300 border border-emerald-400/20">
              <BadgeCheck className="h-5 w-5" />
            </span>
          </div>

          <div className="relative space-y-4 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-gradient-to-b before:from-emerald-400/40 before:via-amber-400/30 before:to-sky-400/40">
            {[
              { icon: FileCheck2, label: 'ความไม่เปลี่ยนแปลงของหลักฐาน', detail: 'Trigger ป้องกันแก้ไข/ลบไฟล์ที่ STORED', state: 'ENFORCED', color: 'text-emerald-300' },
              { icon: Sparkles, label: 'มนุษย์ตรวจสอบ AI ทุกขั้นตอน', detail: 'ผลลัพธ์เป็น SUGGESTED จนกว่าจะยืนยัน', state: 'HUMAN-IN-THE-LOOP', color: 'text-amber-300' },
              { icon: Scale, label: 'รายงานพร้อม Snapshot Hash', detail: 'ตรึงรหัส SHA-256 ของพยานหลักฐานต้นทาง', state: 'IMMUTABLE', color: 'text-sky-300' },
            ].map(({ icon: Icon, label, detail, state, color }) => (
              <div key={label} className="relative flex items-start gap-3 pl-2">
                <span className={`relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[#07131f] ${color} shadow-[0_0_10px_rgba(0,0,0,0.4)]`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-200">{label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{detail}</span>
                  <span className="mt-2 inline-flex rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 font-mono text-[9px] font-bold text-slate-400 sm:hidden">{state}</span>
                </span>
                <span className="hidden rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 font-mono text-[9px] font-bold text-slate-400 sm:inline-flex">
                  {state}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-950/20 p-4">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <p className="text-[11px] leading-relaxed text-slate-400">
              ระบบนี้ออกแบบเพื่อสนับสนุนการทำงานของเจ้าหน้าที่ตามหลักนิติวิทยาศาสตร์ดิจิทัล ข้อมูลทุกรายการสามารถตรวจสอบแหล่งที่มาได้
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

