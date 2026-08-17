'use client';

import { useSyncExternalStore } from 'react';
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
import {
  getAuditLogs,
  getCases,
  getEntities,
  getEvidence,
  getIntakeEnvelopes,
  INITIAL_AUDIT_LOGS,
  INITIAL_CASES,
  INITIAL_ENTITIES,
  INITIAL_EVIDENCE,
  INITIAL_INTAKE_ENVELOPES,
} from '@/lib/demo-data';

const subscribeToDemoData = (onStoreChange: () => void) => {
  window.addEventListener('ev-data-change', onStoreChange);
  return () => window.removeEventListener('ev-data-change', onStoreChange);
};

function useCount(getClientCount: () => number, serverCount: number) {
  return useSyncExternalStore(subscribeToDemoData, getClientCount, () => serverCount);
}

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
  const intakeCount = useCount(() => getIntakeEnvelopes().length, INITIAL_INTAKE_ENVELOPES.length);
  const caseCount = useCount(() => getCases().length, INITIAL_CASES.length);
  const evidenceCount = useCount(() => getEvidence().length, INITIAL_EVIDENCE.length);
  const entityCount = useCount(() => getEntities().length, INITIAL_ENTITIES.length);
  const auditCount = useCount(() => getAuditLogs().length, INITIAL_AUDIT_LOGS.length);
  const queue = INITIAL_INTAKE_ENVELOPES.filter((item) => item.status === 'TRIAGE_PENDING').slice(0, 3);

  const stats = [
    { label: 'รอคัดกรอง', value: intakeCount, unit: 'เรื่อง', hint: 'ทุกช่องทางรับเรื่อง', href: '/intake', icon: Inbox, tone: 'text-teal-300', surface: 'bg-teal-300/[0.08]' },
    { label: 'สำนวนที่ติดตาม', value: caseCount, unit: 'สำนวน', hint: 'พื้นที่รับผิดชอบของคุณ', href: '/cases', icon: BriefcaseBusiness, tone: 'text-sky-300', surface: 'bg-sky-300/[0.08]' },
    { label: 'หลักฐานต้นฉบับ', value: evidenceCount, unit: 'ไฟล์', hint: 'เก็บพร้อม SHA-256', href: '/evidence', icon: Fingerprint, tone: 'text-amber-200', surface: 'bg-amber-300/[0.08]' },
    { label: 'ข้อมูลที่จัดระเบียบ', value: entityCount, unit: 'รายการ', hint: `${auditCount} เหตุการณ์ตรวจสอบ`, href: '/entities', icon: Database, tone: 'text-violet-300', surface: 'bg-violet-300/[0.08]' },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="glass-panel relative overflow-hidden rounded-[28px] p-6 sm:p-8 lg:p-10">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full border border-teal-300/10 bg-teal-300/[0.035] blur-2xl" />
        <div className="absolute bottom-0 right-0 hidden h-full w-[42%] opacity-40 lg:block" aria-hidden="true">
          <div className="absolute right-16 top-1/2 h-52 w-52 -translate-y-1/2 rounded-full border border-teal-200/15" />
          <div className="absolute right-24 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full border border-teal-200/10" />
          <Radar className="absolute right-[104px] top-1/2 h-20 w-20 -translate-y-1/2 text-teal-300/20" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-300/15 bg-teal-300/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Evidence-assisted · Human-confirmed
          </div>
          <h1 className="text-balance text-3xl font-bold leading-[1.25] tracking-[-0.035em] text-white sm:text-4xl lg:text-[46px]">
            เห็นภาพรวมเร็วขึ้น<br />
            <span className="text-teal-200">โดยไม่เสียร่องรอยของหลักฐาน</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            จัดลำดับงานค้าง ตรวจข้อเสนอจากระบบ และย้อนกลับทุกข้อสรุปถึงหลักฐานต้นฉบับได้ในพื้นที่ทำงานเดียว
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/intake" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-300 px-5 text-sm font-bold text-[#05201d] shadow-[0_12px_34px_rgba(45,212,191,0.16)] transition hover:-translate-y-0.5 hover:bg-teal-200">
              เปิดคิวคัดกรอง <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link href="/review" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.065]">
              <Sparkles className="h-4 w-4 text-amber-200" /> ตรวจข้อเสนอจาก AI
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="ตัวชี้วัดสำคัญ" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="soft-panel group rounded-2xl p-5 transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-[#0e1c2e]">
              <div className="flex items-start justify-between gap-4">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${stat.surface} ${stat.tone}`}><Icon className="h-[19px] w-[19px]" /></span>
                <ArrowUpRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-400" />
              </div>
              <p className="mt-5 text-xs font-medium text-slate-500">{stat.label}</p>
              <p className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-bold tracking-[-0.04em] text-white">{stat.value}</span><span className="text-xs text-slate-500">{stat.unit}</span></p>
              <p className="mt-3 text-[11px] text-slate-600">{stat.hint}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
        <div className="glass-panel overflow-hidden rounded-[24px]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-200" /><h2 className="text-base font-semibold text-white">งานที่ควรตรวจวันนี้</h2></div>
              <p className="mt-1 text-xs text-slate-500">เรียงตามความเร่งด่วนและสถานะการสแกน</p>
            </div>
            <Link href="/intake" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300 hover:text-teal-200">ดูคิวทั้งหมด <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {queue.map((item, index) => (
              <Link key={item.id} href={`/intake/${item.id}`} className="group grid gap-4 px-5 py-5 transition hover:bg-white/[0.025] sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-xs font-semibold text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${urgencyStyle[item.urgency]}`}>{urgencyLabel[item.urgency]}</span>
                    <span className="text-[10px] text-slate-600">{item.jurisdiction_agency || 'ยังไม่กำหนดหน่วยงาน'}</span>
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium text-slate-200 group-hover:text-white">{item.urgency_reason || 'รอตรวจรายละเอียดคำร้อง'}</span>
                  <span className="mt-1 block text-[11px] text-slate-600">รับเมื่อ {new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition group-hover:text-teal-300">เปิดตรวจ <ChevronRight className="h-3.5 w-3.5" /></span>
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[24px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-base font-semibold text-white">ความพร้อมของสายหลักฐาน</h2><p className="mt-1 text-xs text-slate-500">หลักควบคุมก่อนนำข้อมูลไปใช้</p></div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-300/[0.08] text-emerald-300"><BadgeCheck className="h-5 w-5" /></span>
          </div>
          <div className="mt-6 space-y-5">
            {[
              { icon: FileCheck2, label: 'ต้นฉบับและค่าแฮช', detail: 'ไม่เขียนทับไฟล์ที่รับเข้าแล้ว', state: 'บังคับใช้', color: 'text-emerald-300' },
              { icon: Sparkles, label: 'ข้อเสนอจาก AI', detail: 'รอมนุษย์ยืนยันก่อนทุกครั้ง', state: 'Human review', color: 'text-amber-200' },
              { icon: Scale, label: 'ข้อสรุปและรายงาน', detail: 'อ้างกลับถึงแหล่งข้อมูลได้', state: 'Traceable', color: 'text-sky-300' },
            ].map(({ icon: Icon, label, detail, state, color }) => (
              <div key={label} className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.035] ${color}`}><Icon className="h-4 w-4" /></span>
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
