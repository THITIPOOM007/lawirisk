'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Database,
  Loader2,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { createClient, isDemoModeEnabled, isSupabaseConfigured } from '@/lib/supabase';
import { writeDemoAuthCookies } from '@/lib/browser-cookies';
import type { StaffRole } from '@/lib/roles';

type DemoRole = StaffRole;

const demoRoles: { role: DemoRole; label: string; description: string; name: string }[] = [
  { role: 'INVESTIGATOR', label: 'พนักงานสืบสวน', description: 'รับเรื่อง คดี และหลักฐาน', name: 'ร.ต.อ. สมชาย (Investigator)' },
  { role: 'REVIEWER', label: 'ผู้ตรวจทาน', description: 'ตรวจข้อเสนอและการเชื่อมโยง', name: 'นางสาวจิราภรณ์ (Reviewer)' },
  { role: 'VIEWER', label: 'ผู้สังเกตการณ์', description: 'อ่านข้อมูลที่ได้รับสิทธิ์', name: 'เจ้าหน้าที่สังเกตการณ์' },
  { role: 'ADMIN', label: 'ผู้ดูแลระบบ', description: 'จัดการนโยบายและผู้ใช้', name: 'พล.ต.ต. สุรศักดิ์ (Admin)' },
];

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeDemoRole, setActiveDemoRole] = useState<DemoRole | null>(null);
  const [isDemoMode] = useState(() => isDemoModeEnabled());
  const [isAuthConfigured] = useState(() => isSupabaseConfigured());
  const [errorMessage, setErrorMessage] = useState('');

  const finishDemoLogin = (role: DemoRole, name: string) => {
    writeDemoAuthCookies(role, name);
    // Cross the authentication boundary with a full request so Proxy observes
    // the cookies written above instead of reusing an unauthenticated RSC
    // navigation that may already be in the client cache.
    window.location.replace('/');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    if (isDemoMode) {
      setActiveDemoRole('INVESTIGATOR');
      finishDemoLogin('INVESTIGATOR', 'ร.ต.อ. สมชาย (Investigator)');
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง');
        return;
      }
      const searchParams = new URLSearchParams(window.location.search);
      const nextPath = searchParams.get('next') || '/';
      window.location.replace(nextPath);
    } catch (error: unknown) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (role: DemoRole, name: string) => {
    if (isLoading) return;
    setErrorMessage('');
    setActiveDemoRole(role);
    setIsLoading(true);
    finishDemoLogin(role, name);
  };

  return (
    <main className="app-backdrop relative grid min-h-dvh overflow-hidden lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden border-r border-white/[0.07] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -left-28 top-[18%] h-80 w-80 rounded-full bg-teal-300/[0.08] blur-[100px]" />
        <div className="relative z-10 flex items-center gap-5">
          <span className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[26px] border border-cyan-200/30 bg-gradient-to-br from-cyan-300/20 via-[#03101c] to-amber-300/20 shadow-[0_0_55px_rgba(34,211,238,0.18),0_0_70px_rgba(251,191,36,0.08),inset_0_1px_rgba(255,255,255,0.16)]">
            <span className="absolute inset-px rounded-[25px] bg-[#020b18]/90" />
            <Image src="/lawirisk-ssk-mark-v2.png" alt="" width={96} height={88} className="relative z-10 h-full w-full object-contain p-2 drop-shadow-[0_8px_18px_rgba(34,211,238,0.22)]" priority />
          </span>
          <span>
            <span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-2xl font-black tracking-[-0.045em] text-transparent">LawiRisk-SSK</span>
            <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-200/80">Digital Evidence Intelligence</span>
          </span>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"><ScanLine className="h-3.5 w-3.5 text-teal-300" /> Evidence integrity first</div>
          <h1 className="text-balance text-4xl font-bold leading-[1.25] tracking-[-0.04em] text-white xl:text-5xl">ทุกข้อสรุป<br /><span className="text-teal-200">ต้องย้อนกลับถึงต้นฉบับได้</span></h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-slate-400">พื้นที่ทำงานสำหรับจัดระเบียบหลักฐาน ตรวจข้อเสนอจากระบบ และบันทึกการตัดสินใจของมนุษย์อย่างตรวจสอบย้อนกลับได้</p>
          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              { icon: LockKeyhole, title: 'สิทธิ์รายคดี', text: 'ปิดการเข้าถึงโดยค่าเริ่มต้น' },
              { icon: BadgeCheck, title: 'ต้นฉบับคงเดิม', text: 'ยืนยันด้วย SHA-256' },
              { icon: Sparkles, title: 'มนุษย์ยืนยัน', text: 'AI ให้ข้อเสนอเท่านั้น' },
            ].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><Icon className="h-4 w-4 text-teal-300" /><p className="mt-3 text-xs font-semibold text-slate-200">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">{text}</p></div>)}
          </div>
        </div>

        <p className="relative z-10 text-[10px] leading-5 text-slate-600">ระบบช่วยงานหลักฐาน ไม่ใช้ตัดสินความผิด ตัวตน เจตนา ความเป็นเจ้าของ หรือความรับผิดโดยอัตโนมัติ</p>
      </section>

      <section className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-[520px]">
          <div className="mb-8 flex items-center gap-3.5 lg:hidden">
            <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-200/30 bg-gradient-to-br from-cyan-300/20 via-[#03101c] to-amber-300/20 shadow-[0_0_34px_rgba(34,211,238,0.16)]">
              <span className="absolute inset-px rounded-[15px] bg-[#020b18]/90" />
              <Image src="/lawirisk-ssk-mark-v2.png" alt="" width={56} height={51} className="relative z-10 h-full w-full object-contain p-1.5" priority />
            </span>
            <span><span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-lg font-black tracking-[-0.035em] text-transparent">LawiRisk-SSK</span><span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-200/75">Digital Evidence Intelligence</span></span>
          </div>

          <div className="glass-panel rounded-[28px] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300/70">Secure workspace</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-white">เข้าสู่พื้นที่ทำงาน</h2><p className="mt-2 text-sm text-slate-500">ยืนยันตัวตนเพื่อเข้าถึงข้อมูลตามสิทธิ์ของคุณ</p></div>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isDemoMode ? 'bg-amber-300/[0.08] text-amber-200' : 'bg-emerald-300/[0.08] text-emerald-300'}`}><Database className="h-[18px] w-[18px]" /></span>
            </div>

            <div className={`mt-6 flex items-center gap-3 rounded-xl border p-3 text-xs ${isDemoMode ? 'border-amber-300/15 bg-amber-300/[0.045] text-amber-100' : 'border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-100'}`}>
              <span className={`h-2 w-2 rounded-full ${isDemoMode ? 'bg-amber-300' : 'status-pulse bg-emerald-300 text-emerald-300'}`} />
              <span className="font-medium">{isDemoMode ? 'โหมดสาธิต · ข้อมูลอยู่ในอุปกรณ์นี้' : 'เชื่อมต่อระบบสืบสวนกลางแล้ว'}</span>
            </div>

            {errorMessage && <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{errorMessage}</span></div>}

            <form onSubmit={handleLogin} className="mt-6 space-y-5">
              <div><label htmlFor="email" className="text-xs font-medium text-slate-300">อีเมลผู้ใช้</label><input id="email" name="email" type="email" autoComplete="username" required={!isDemoMode} disabled={isLoading || isDemoMode} value={email} onChange={(event) => setEmail(event.target.value)} placeholder={isDemoMode ? 'ไม่จำเป็นสำหรับโหมดสาธิต' : 'name@agency.go.th'} className="mt-2 block min-h-12 w-full rounded-xl border border-white/[0.09] bg-[#07121f]/80 px-4 text-sm text-white placeholder:text-slate-700 focus:border-teal-300/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" /></div>
              <div><div className="flex items-center justify-between"><label htmlFor="password" className="text-xs font-medium text-slate-300">รหัสผ่าน</label>{!isDemoMode && <span className="text-[10px] text-slate-600">ติดต่อผู้ดูแลเมื่อเข้าไม่ได้</span>}</div><input id="password" name="password" type="password" autoComplete="current-password" required={!isDemoMode} disabled={isLoading || isDemoMode} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••••" className="mt-2 block min-h-12 w-full rounded-xl border border-white/[0.09] bg-[#07121f]/80 px-4 text-sm text-white placeholder:text-slate-700 focus:border-teal-300/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" /></div>
              <button type="submit" disabled={isLoading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-300 px-5 text-sm font-bold text-[#05201d] shadow-[0_12px_34px_rgba(45,212,191,0.14)] transition hover:-translate-y-0.5 hover:bg-teal-200 disabled:cursor-wait disabled:opacity-60">
                {isLoading && activeDemoRole === 'INVESTIGATOR' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {isDemoMode ? 'เข้าใช้งานในฐานะพนักงานสืบสวน' : 'ลงชื่อเข้าใช้งาน'}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {isDemoMode && <div className="mt-7 border-t border-white/[0.07] pt-6"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-300">หรือเลือกบทบาทสาธิต</p><p className="text-[9px] text-slate-600">ไม่มีข้อมูลจริง</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{demoRoles.map((item) => <button key={item.role} type="button" onClick={() => handleDemoLogin(item.role, item.name)} disabled={isLoading} className={`group flex min-h-[58px] items-center justify-between rounded-xl border px-3.5 text-left transition ${activeDemoRole === item.role ? 'border-teal-300/30 bg-teal-300/[0.07]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'} disabled:cursor-wait disabled:opacity-60`}><span><span className="block text-xs font-medium text-slate-200">{item.label}</span><span className="mt-0.5 block text-[9px] text-slate-600">{item.description}</span></span>{isLoading && activeDemoRole === item.role ? <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-300" /> : <ArrowRight className="h-3.5 w-3.5 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />}</button>)}</div></div>}
          </div>
        </div>
      </section>
    </main>
  );
}
