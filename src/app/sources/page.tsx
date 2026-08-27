'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  DatabaseZap,
  FileUp,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Route,
  SearchCheck,
  ShieldAlert,
} from 'lucide-react';
import type { ExternalSource, ReconServiceKey } from '@/lib/external-sources';

const LOCAL_RECON_BRIDGE_URL = 'http://127.0.0.1:32147/v1/command';

async function invokeLocalCompanion(uri: string): Promise<'LOCAL_BRIDGE' | 'WINDOWS_PROTOCOL'> {
  try {
    const response = await fetch(LOCAL_RECON_BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LawiRisk-Recon-Client': 'lawirisk-web-1',
      },
      body: JSON.stringify({ uri }),
      signal: AbortSignal.timeout(3_500),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'LOCAL_BRIDGE_UNAVAILABLE');
    return 'LOCAL_BRIDGE';
  }
  catch {
    window.location.assign(uri);
    return 'WINDOWS_PROTOCOL';
  }
}

const statusMeta = {
  LOCAL_AUTO_LOGIN: {
    label: 'Auto-login บนเครื่อง',
    detail: 'Recon Companion กรอกบัญชีและกดเข้าสู่ระบบบนเครื่อง Windows ของเจ้าหน้าที่',
    icon: BadgeCheck,
    className: 'border-emerald-300/15 bg-emerald-300/[0.055] text-emerald-200',
  },
  LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED: {
    label: 'Auto-login แบบมีความเสี่ยง',
    detail: 'ทำได้เฉพาะ Recon Companion และต้องยืนยัน HTTP ทุกครั้ง',
    icon: ShieldAlert,
    className: 'border-rose-300/15 bg-rose-300/[0.055] text-rose-200',
  },
} as const;

export default function SourcesPage() {
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [launchingKey, setLaunchingKey] = useState<string>('');
  const [settingUpKey, setSettingUpKey] = useState<string>('');
  const [insecureAcknowledged, setInsecureAcknowledged] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Partial<Record<ExternalSource['key'], ReconServiceKey>>>({});

  async function setupCompanion(source: ExternalSource) {
    setSettingUpKey(source.key);
    setError('');
    setNotice('');
    try {
      const channel = await invokeLocalCompanion(source.companionSetupUrl);
      setNotice(channel === 'LOCAL_BRIDGE'
        ? `เปิดหน้าต่างตั้งค่าบัญชี ${source.name} แล้ว กรุณากรอกในหน้าต่าง Windows ที่ปรากฏ`
        : 'กำลังเปิดผ่าน Windows protocol หากไม่มีหน้าต่างปรากฏให้ติดตั้ง Recon Companion ใหม่');
    }
    catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'เปิดหน้าต่างตั้งค่าบัญชีไม่สำเร็จ');
    }
    finally {
      setSettingUpKey('');
    }
  }

  async function launchCompanion(source: ExternalSource) {
    setLaunchingKey(source.key);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/v1/sources/${source.key}/companion`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: selectedServices[source.key] || source.services[0]?.key,
          acknowledge_insecure_transport: source.transport === 'HTTP_ONLY' ? insecureAcknowledged : false,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || 'เรียก Recon Companion ไม่สำเร็จ');
      const channel = await invokeLocalCompanion(body.data.companion_uri);
      setNotice(channel === 'LOCAL_BRIDGE'
        ? `เปิด Recon Companion สำหรับ ${source.name} แล้ว`
        : 'กำลังเปิดผ่าน Windows protocol หากไม่มีหน้าต่างปรากฏให้ติดตั้ง Recon Companion ใหม่');
    }
    catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'เรียก Recon Companion ไม่สำเร็จ');
    }
    finally {
      setLaunchingKey('');
    }
  }

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

      {notice && (
        <div role="status" className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 text-sm text-emerald-100">
          {notice}
        </div>
      )}

      <section aria-label="ทะเบียนแหล่งสืบค้น" className="grid gap-5 xl:grid-cols-2">
        {isLoading ? [0, 1].map((item) => (
          <div key={item} className="soft-panel min-h-[390px] rounded-[26px] p-6"><div className="skeleton-shimmer h-12 w-12 rounded-2xl" /><div className="mt-6 h-7 w-52 rounded-lg skeleton-shimmer" /><div className="mt-4 h-4 w-full rounded skeleton-shimmer" /><div className="mt-2 h-4 w-3/4 rounded skeleton-shimmer" /></div>
        )) : sources.map((source) => {
          const status = statusMeta[source.accessMode];
          const StatusIcon = status.icon;
          const SourceIcon = source.key === 'FDA_SKYNET' ? DatabaseZap : Building2;
          const launchable = source.transport === 'HTTPS';
          const insecure = source.transport === 'HTTP_ONLY';
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
                <div className="rounded-xl border border-white/[0.055] bg-white/[0.02] p-3"><dt className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600"><LockKeyhole className="h-3.5 w-3.5" />Transport</dt><dd className={`mt-1.5 text-xs font-medium ${source.transport === 'HTTPS' ? 'text-emerald-200' : 'text-rose-200'}`}>{source.transport === 'HTTPS' ? 'HTTPS ตรวจแล้ว' : 'HTTP ไม่มี TLS'}</dd></div>
              </dl>

              <div className={`mt-5 rounded-xl border p-4 text-[11px] leading-5 ${launchable ? 'border-sky-300/10 bg-sky-300/[0.035] text-slate-500' : 'border-rose-300/10 bg-rose-300/[0.035] text-rose-100/70'}`}>
                <p className="font-semibold text-slate-300">{status.detail}</p>
                <p className="mt-1">{source.limitation}</p>
              </div>

              <fieldset className="mt-5">
                <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">เลือกหน้าสืบค้นหลังล็อกอิน</legend>
                <div className="mt-2 grid gap-2">
                  {source.services.map((service) => {
                    const selected = (selectedServices[source.key] || source.services[0]?.key) === service.key;
                    return (
                      <label key={service.key} className={`cursor-pointer rounded-xl border p-3 transition ${selected ? 'border-teal-300/25 bg-teal-300/[0.07]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'}`}>
                        <span className="flex items-start gap-3">
                          <input
                            type="radio"
                            name={`service-${source.key}`}
                            value={service.key}
                            checked={selected}
                            onChange={() => setSelectedServices((current) => ({ ...current, [source.key]: service.key }))}
                            className="mt-1 h-4 w-4 accent-teal-400"
                          />
                          <span>
                            <span className="block text-xs font-semibold text-slate-200">{service.name}</span>
                            <span className="mt-1 block text-[10px] leading-4 text-slate-500">{service.description}</span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-auto space-y-3 pt-6">
                <button
                  type="button"
                  onClick={() => void setupCompanion(source)}
                  disabled={settingUpKey === source.key}
                  className="secondary-action inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-5 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {settingUpKey === source.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 text-teal-300" />}
                  ตั้ง/เปลี่ยนบัญชีบนเครื่องนี้
                </button>
                {insecure && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-3 text-[11px] leading-5 text-rose-100">
                    <input type="checkbox" checked={insecureAcknowledged} onChange={(event) => setInsecureAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-500" />
                    <span>รับทราบว่า HSS ใช้ HTTP และบัญชี/รหัสผ่านจะเดินทางโดยไม่มี TLS ตามข้อจำกัดของระบบต้นทาง</span>
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => void launchCompanion(source)}
                  disabled={launchingKey === source.key || (insecure && !insecureAcknowledged)}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 ${insecure ? 'border border-rose-300/20 bg-rose-500/15 text-rose-100' : 'primary-action'}`}
                >
                  {launchingKey === source.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                  ล็อกอินและเปิดหน้าสืบค้นที่เลือก
                </button>
                {launchable && (
                  <form method="post" action={`/api/v1/sources/${source.key}/launch`} target="_blank">
                    <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-300">เปิดเองโดยไม่ใช้ Companion <ArrowUpRight className="h-3.5 w-3.5" /></button>
                  </form>
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
            ['03', 'นำเข้าคลังหลักฐาน', 'เลือกคดี ตรวจชนิดไฟล์ คำนวณ SHA-256 และจัดเก็บในพื้นที่ส่วนตัว'],
            ['04', 'มนุษย์ตรวจยืนยัน', 'อ้าง source mention ก่อนยืนยันข้อเสนอ ความสัมพันธ์ หรือรายงาน'],
          ].map(([number, title, detail]) => (
            <li key={number} className="rounded-2xl border border-white/[0.06] bg-white/[0.022] p-4"><span className="font-mono text-[10px] font-bold text-teal-300/70">{number}</span><h3 className="mt-3 text-sm font-semibold text-slate-200">{title}</h3><p className="mt-2 text-[11px] leading-5 text-slate-600">{detail}</p></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
