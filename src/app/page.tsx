'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  FileCheck2,
  Fingerprint,
  Inbox,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { IntakeEnvelope } from '@/lib/demo-data';

const urgencyStyle: Record<string, string> = {
  CRITICAL: 'border-rose-400/20 bg-rose-400/[0.07] text-rose-300',
  HIGH: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200',
  NORMAL: 'border-sky-300/20 bg-sky-300/[0.07] text-sky-200',
  LOW: 'border-slate-400/20 bg-slate-400/[0.07] text-slate-300',
};

const urgencyLabel: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  HIGH: 'เร่งด่วน',
  NORMAL: 'ปกติ',
  LOW: 'เฝ้าระวัง',
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
    { label: 'รายการรับเรื่อง', value: counts.intake, unit: 'เรื่อง', hint: 'ตามสิทธิ์ที่เข้าถึงได้', href: '/intake', icon: Inbox, tone: 'text-teal-300', surface: 'bg-teal-300/[0.08]' },
    { label: 'สำนวนที่ติดตาม', value: counts.cases, unit: 'สำนวน', hint: 'พื้นที่รับผิดชอบของคุณ', href: '/cases', icon: BriefcaseBusiness, tone: 'text-sky-300', surface: 'bg-sky-300/[0.08]' },
    { label: 'หลักฐานต้นฉบับ', value: counts.evidence, unit: 'ไฟล์', hint: 'จัดเก็บสำเร็จตาม RLS', href: '/evidence', icon: Fingerprint, tone: 'text-amber-200', surface: 'bg-amber-300/[0.08]' },
    { label: 'ข้อมูลที่จัดระเบียบ', value: counts.entities, unit: 'รายการ', hint: `${counts.audit} เหตุการณ์ตรวจสอบ`, href: '/entities', icon: Database, tone: 'text-violet-300', surface: 'bg-violet-300/[0.08]' },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {loadError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{loadError}</div>}
      <section className="glass-panel relative isolate min-h-[360px] overflow-hidden rounded-[30px] p-6 sm:p-8 lg:flex lg:items-center lg:p-11">
        <div className="scan-line absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-teal-200/50 to-transparent" aria-hidden="true" />
        <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-sky-400/[0.045] blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-40 right-20 h-80 w-80 rounded-full bg-teal-300/[0.055] blur-3xl" aria-hidden="true" />
        <div className="absolute bottom-0 right-0 hidden h-full w-[43%] overflow-hidden lg:block" aria-hidden="true">
          <div className="absolute right-[15%] top-1/2 -translate-y-1/2">
            <div className="signal-radar grid h-64 w-64 place-items-center xl:h-72 xl:w-72">
              <div className="absolute inset-[18%] rounded-full border border-teal-200/[0.08]" />
              <div className="absolute inset-[36%] rounded-full border border-teal-200/[0.08]" />
              <Radar className="h-16 w-16 text-teal-200/[0.12]" />
              <span className="absolute left-[28%] top-[31%] h-1.5 w-1.5 rounded-full bg-teal-200 shadow-[0_0_14px_rgba(94,234,212,0.85)]" />
              <span className="absolute bottom-[29%] right-[25%] h-1 w-1 rounded-full bg-sky-200 shadow-[0_0_12px_rgba(125,211,252,0.75)]" />
            </div>
          </div>
          <div className="absolute bottom-7 right-8 flex items-center gap-2 rounded-full border border-white/[0.065] bg-[#07131f]/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500 backdrop-blur-xl">
            <span className="status-pulse h-1.5 w-1.5 rounded-full bg-teal-300 text-teal-300" /> integrity controls active
          </div>
        </div>
        <div className="relative z-10 max-w-3xl lg:max-w-[62%]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-300/15 bg-teal-300/[0.055] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-teal-100 shadow-[inset_0_1px_rgba(255,255,255,0.05)]">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
            Evidence-assisted · Human-confirmed
          </div>
          <h1 className="text-balance text-3xl font-bold leading-[1.2] tracking-[-0.045em] text-white sm:text-4xl lg:text-[48px] xl:text-[52px]">
            เห็นภาพรวมเร็วขึ้น<br />
            <span className="bg-gradient-to-r from-teal-100 via-teal-200 to-sky-200 bg-clip-text text-transparent">โดยไม่เสียร่องรอยของหลักฐาน</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-[15px]">
            จัดลำดับงานค้าง ตรวจข้อเสนอจากระบบ และย้อนกลับทุกข้อสรุปถึงหลักฐานต้นฉบับได้ในพื้นที่ทำงานเดียว
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/intake" className="primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold">
              เปิดคิวคัดกรอง <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link href="/review" className="secondary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-amber-200" /> ตรวจข้อเสนอจาก AI
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="ตัวชี้วัดสำคัญ" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="soft-panel interactive-card group rounded-[22px] p-5">
              <div className="flex items-start justify-between gap-4">
                <span className={`grid h-11 w-11 place-items-center rounded-[14px] border border-white/[0.04] ${stat.surface} ${stat.tone}`}><Icon className="h-[19px] w-[19px] transition-transform duration-500 group-hover:scale-110" /></span>
                <ArrowUpRight className="h-4 w-4 text-slate-700 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-teal-200" />
              </div>
              <p className="mt-5 text-xs font-medium text-slate-500">{stat.label}</p>
              <p className="mt-1 flex min-h-9 items-baseline gap-2">{isLoading ? <span className="skeleton-shimmer h-8 w-16 rounded-lg" /> : <><span key={stat.value} className="metric-value text-3xl font-bold tracking-[-0.04em] text-white">{stat.value}</span><span className="text-xs text-slate-500">{stat.unit}</span></>}</p>
              <p className="mt-3 text-[11px] text-slate-600">{stat.hint}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
        <div className="glass-panel overflow-hidden rounded-[26px]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-200" /><h2 className="text-base font-semibold text-white">งานที่ควรตรวจวันนี้</h2></div>
              <p className="mt-1 text-xs text-slate-500">เรียงตามความเร่งด่วนและสถานะการสแกน</p>
            </div>
            <Link href="/intake" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200">ดูคิวทั้งหมด <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {isLoading ? [0, 1, 2].map((item) => <div key={item} className="grid gap-4 px-6 py-5 sm:grid-cols-[40px_minmax(0,1fr)_80px] sm:items-center"><span className="skeleton-shimmer h-10 w-10 rounded-xl" /><span className="space-y-2"><span className="skeleton-shimmer block h-3 w-24 rounded" /><span className="skeleton-shimmer block h-4 w-3/4 rounded" /></span><span className="skeleton-shimmer hidden h-4 w-16 rounded sm:block" /></div>) : queue.length ? queue.slice(0, 3).map((item, index) => (
              <Link key={item.id} href={`/intake/${item.id}`} className="group relative grid gap-4 px-5 py-5 transition duration-300 hover:bg-white/[0.03] sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                <span className="absolute inset-y-3 left-0 w-px scale-y-0 bg-gradient-to-b from-transparent via-teal-300 to-transparent transition-transform duration-300 group-hover:scale-y-100" aria-hidden="true" />
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-xs font-semibold text-slate-500 transition-colors group-hover:border-teal-300/15 group-hover:text-teal-200">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${urgencyStyle[item.urgency]}`}>{urgencyLabel[item.urgency]}</span>
                    <span className="text-[10px] text-slate-600">{item.jurisdiction_agency || 'ยังไม่กำหนดหน่วยงาน'}</span>
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium text-slate-200 group-hover:text-white">{item.urgency_reason || 'รอตรวจรายละเอียดคำร้อง'}</span>
                  <span className="mt-1 block text-[11px] text-slate-600">รับเมื่อ {new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition group-hover:text-teal-300">เปิดตรวจ <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
              </Link>
            )) : <div className="px-6 py-12 text-center text-sm text-slate-500">ไม่มีรายการรอคัดกรองที่เข้าถึงได้</div>}
          </div>
        </div>

        <div className="glass-panel rounded-[26px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-base font-semibold text-white">ความพร้อมของสายหลักฐาน</h2><p className="mt-1 text-xs text-slate-500">หลักควบคุมก่อนนำข้อมูลไปใช้</p></div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-300/[0.08] text-emerald-300"><BadgeCheck className="h-5 w-5" /></span>
          </div>
          <div className="relative mt-6 space-y-5 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-gradient-to-b before:from-emerald-300/30 before:via-amber-200/20 before:to-sky-300/30">
            {[
              { icon: FileCheck2, label: 'ต้นฉบับและค่าแฮช', detail: 'ไม่เขียนทับไฟล์ที่รับเข้าแล้ว', state: 'บังคับใช้', color: 'text-emerald-300' },
              { icon: Sparkles, label: 'ข้อเสนอจาก AI', detail: 'รอมนุษย์ยืนยันก่อนทุกครั้ง', state: 'Human review', color: 'text-amber-200' },
              { icon: Scale, label: 'ข้อสรุปและรายงาน', detail: 'อ้างกลับถึงแหล่งข้อมูลได้', state: 'Traceable', color: 'text-sky-300' },
            ].map(({ icon: Icon, label, detail, state, color }) => (
              <div key={label} className="relative flex items-start gap-3">
                <span className={`relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.055] bg-[#0b1827] ${color}`}><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-200">{label}</span><span className="mt-0.5 block text-[11px] leading-5 text-slate-600">{detail}</span></span>
                <span className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] font-medium text-slate-500">{state}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-300/10 bg-sky-300/[0.04] p-4">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <p className="text-[11px] leading-5 text-slate-500">ระบบนี้ช่วยจัดระเบียบและเสนอความเชื่อมโยง ไม่ใช้ตัดสินความผิด ตัวตน เจตนา หรือความรับผิดโดยอัตโนมัติ</p>
          </div>
        </div>
      </section>
    </div>
  );
}
