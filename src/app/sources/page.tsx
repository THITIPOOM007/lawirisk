'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Building2,
  DatabaseZap,
  FileUp,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Route,
  SearchCheck,
  ShieldAlert,
} from 'lucide-react';
import type { ExternalSource } from '@/lib/external-sources';

const statusMeta = {
  MANUAL_ONLY: {
    label: 'พร้อมใช้แบบ Manual',
    detail: 'เข้าสู่ระบบที่ต้นทางและนำผลทางการกลับมาจัดเก็บเป็นหลักฐาน',
    icon: BadgeCheck,
    className: 'border-emerald-300/15 bg-emerald-300/[0.055] text-emerald-200',
  },
  BLOCKED_INSECURE_TRANSPORT: {
    label: 'ถูกบล็อกเพื่อความปลอดภัย',
    detail: 'รอ HTTPS endpoint หรือ API ที่หน่วยงานรับรอง',
    icon: Ban,
    className: 'border-rose-300/15 bg-rose-300/[0.055] text-rose-200',
  },
} as const;

export default function SourcesPage() {
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/sources', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดแหล่งสืบค้นไม่สำเร็จ');
        setSources(body.data as ExternalSource[]);
        setError('');
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'โหลดแหล่งสืบค้นไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [reloadToken]);

  return (
    <div className="space-y-7">
      <header className="glass-panel relative overflow-hidden rounded-[28px] p-6 sm:p-8">
        <div className="absolute -right-20 -top-28 h-64 w-64 rounded-full bg-teal-300/[0.06] blur-3xl" aria-hidden="true" />
        <div className="relative max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-300/15 bg-teal-300/[0.055] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-teal-100">
            <SearchCheck className="h-3.5 w-3.5 text-teal-300" /> Authorized Source Directory
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">แหล่งสืบค้นข้อมูลที่ได้รับอนุญาต</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            การเข้าถึงระบบฐานข้อมูลภายนอกที่ได้รับอนุญาตตามมาตรฐานความมั่นคงปลอดภัย โดยข้อมูลที่ได้รับจะถูกนำเข้าสู่คลังพยานหลักฐานดิจิทัลเพื่อคำนวณรหัส SHA-256 และเก็บรักษาตามระเบียบ
          </p>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => { setIsLoading(true); setError(''); setReloadToken((value) => value + 1); }} className="secondary-action inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold"><RefreshCw className="h-4 w-4" />ลองใหม่</button>
        </div>
      )}

      <section aria-label="ทะเบียนแหล่งสืบค้น" className="grid gap-5 xl:grid-cols-2">
        {isLoading ? [0, 1].map((item) => (
          <div key={item} className="soft-panel min-h-[390px] rounded-[26px] p-6"><div className="skeleton-shimmer h-12 w-12 rounded-2xl" /><div className="mt-6 h-7 w-52 rounded-lg skeleton-shimmer" /><div className="mt-4 h-4 w-full rounded skeleton-shimmer" /><div className="mt-2 h-4 w-3/4 rounded skeleton-shimmer" /></div>
        )) : sources.map((source) => {
          const status = statusMeta[source.accessMode];
          const StatusIcon = status.icon;
          const SourceIcon = source.key === 'FDA_SKYNET' ? DatabaseZap : Building2;
          const launchable = source.accessMode === 'MANUAL_ONLY' && source.transport === 'HTTPS';
          return (
            <article key={source.key} className="soft-panel interactive-card flex min-h-[390px] flex-col rounded-[26px] p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${launchable ? 'border-teal-300/15 bg-teal-300/[0.07] text-teal-200' : 'border-rose-300/15 bg-rose-300/[0.055] text-rose-200'}`}><SourceIcon className="h-5 w-5" /></span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${status.className}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span>
              </div>
              <h2 className="mt-6 text-xl font-bold tracking-[-0.02em] text-white">{source.name}</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">{source.authority}</p>
              <p className="mt-4 text-sm leading-6 text-slate-300">{source.coverage}</p>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.055] bg-white/[0.02] p-3"><dt className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600"><KeyRound className="h-3.5 w-3.5" />การยืนยันตัวตน</dt><dd className="mt-1.5 text-xs font-medium text-slate-300">{source.authMode === 'EGOV_OIDC' ? 'eGov Connect / OIDC' : 'บัญชีระบบเดิม'}</dd></div>
                <div className="rounded-xl border border-white/[0.055] bg-white/[0.02] p-3"><dt className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600"><LockKeyhole className="h-3.5 w-3.5" />Transport</dt><dd className={`mt-1.5 text-xs font-medium ${source.transport === 'HTTPS' ? 'text-emerald-200' : 'text-rose-200'}`}>{source.transport === 'HTTPS' ? 'HTTPS ตรวจแล้ว' : 'ย้อนกลับไป HTTP'}</dd></div>
              </dl>

              <div className={`mt-5 rounded-xl border p-4 text-[11px] leading-5 ${launchable ? 'border-sky-300/10 bg-sky-300/[0.035] text-slate-500' : 'border-rose-300/10 bg-rose-300/[0.035] text-rose-100/70'}`}>
                <p className="font-semibold text-slate-300">{status.detail}</p>
                <p className="mt-1">{source.limitation}</p>
              </div>

              <div className="mt-auto pt-6">
                {launchable ? (
                  <form method="post" action={`/api/v1/sources/${source.key}/launch`} target="_blank">
                    <button type="submit" className="primary-action inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold">เปิด {source.name} ในหน้าต่างใหม่ <ArrowUpRight className="h-4 w-4" /></button>
                  </form>
                ) : (
                  <button type="button" disabled className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-rose-300/10 bg-rose-300/[0.035] px-5 text-sm font-semibold text-rose-200/60"><ShieldAlert className="h-4 w-4" />ปิดการเปิดใช้งานจนกว่าจะมี HTTPS/API</button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="glass-panel rounded-[26px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Route className="h-5 w-5 text-teal-300" />กระบวนการนำผลค้นมาใช้อย่างตรวจสอบย้อนกลับได้</h2><p className="mt-1 text-xs text-slate-500">ข้อมูลหน้าจอหรือข้อสรุปจากระบบภายนอกยังไม่เป็นหลักฐานใน LawiRisk-SSK จนกว่าจะผ่านขั้นตอนนี้</p></div>
          <Link href="/evidence" className="secondary-action inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold text-slate-200"><FileUp className="h-4 w-4 text-teal-300" />ไปคลังหลักฐาน</Link>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['01', 'ค้นในระบบต้นทาง', 'ใช้บัญชีของเจ้าหน้าที่และค้นตามวัตถุประสงค์ที่ได้รับมอบหมาย'],
            ['02', 'ส่งออกผลทางการ', 'เก็บเลขอ้างอิง วันเวลา และบริบทที่จำเป็นใน PDF/ภาพ'],
            ['03', 'นำเข้าคลังหลักฐาน', 'เลือกคดี ตรวจชนิดไฟล์ คำนวณ SHA-256 และสแกนมัลแวร์'],
            ['04', 'มนุษย์ตรวจยืนยัน', 'อ้าง source mention ก่อนยืนยันข้อเสนอ ความสัมพันธ์ หรือรายงาน'],
          ].map(([number, title, detail]) => (
            <li key={number} className="rounded-2xl border border-white/[0.06] bg-white/[0.022] p-4"><span className="font-mono text-[10px] font-bold text-teal-300/70">{number}</span><h3 className="mt-3 text-sm font-semibold text-slate-200">{title}</h3><p className="mt-2 text-[11px] leading-5 text-slate-600">{detail}</p></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
