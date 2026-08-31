'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, CheckCircle2, ChevronDown, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';

type HealthPayload = {
  status: 'ready' | 'demo' | 'not_ready';
  mode: string;
  checks: Record<string, boolean>;
  blockers: string[];
  timestamp: string;
};

const checkNames: Record<string, string> = {
  supabase: 'ฐานข้อมูลและ RLS',
  serviceRole: 'ระบบบริการภายใน',
  privateEvidenceBucket: 'Evidence Vault',
  fileValidation: 'ตรวจโครงสร้างไฟล์',
  gemini: 'Gemini API configuration',
  n8nAutomation: 'Automation Engine',
};

export function SystemPulse({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as HealthPayload | null;
        if (!body) throw new Error('INVALID_HEALTH_RESPONSE');
        setHealth(body);
        setUnavailable(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setUnavailable(true);
      });
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { onOpenChange(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open, onOpenChange]);

  const ready = health?.status === 'ready' && !unavailable;
  const partial = health?.status === 'demo';
  const label = unavailable ? 'STATUS UNKNOWN' : ready ? 'RUNTIME CONFIGURED' : partial ? 'DEMO SYSTEM' : 'ATTENTION REQUIRED';
  const tone = ready ? 'emerald' : partial ? 'amber' : 'rose';

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={() => onOpenChange(!open)} aria-label={`เปิดสถานะระบบ: ${label}`} aria-expanded={open} aria-haspopup="dialog" aria-controls="system-pulse-panel" className={`system-pulse system-pulse-${tone} hidden min-h-10 items-center gap-2 rounded-full px-3 text-[10px] font-bold sm:flex`}>
        <span className={`status-pulse h-2 w-2 rounded-full ${ready ? 'bg-emerald-300 text-emerald-300' : partial ? 'bg-amber-300 text-amber-300' : 'bg-rose-300 text-rose-300'}`} />
        <Activity className="h-3.5 w-3.5" />
        <span className="hidden font-mono tracking-[0.08em] xl:inline">{label}</span>
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {typeof document !== 'undefined' && open ? createPortal(
        <section ref={panelRef} id="system-pulse-panel" role="dialog" aria-label="สถานะความพร้อมของระบบ" tabIndex={-1} className="system-status-panel fixed z-[80] w-[min(calc(100vw-24px),360px)] overflow-y-auto rounded-[26px] p-4 shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal-300/60">Runtime readiness matrix</p><h3 className="mt-1 text-sm font-black text-white">สถานะการตั้งค่าจากเซิร์ฟเวอร์จริง</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">ตรวจว่าค่าระบบพร้อมใช้งานโดยไม่เปิดเผยความลับ ส่วนบริการภายนอกจะตรวจความสามารถจริงเมื่อเรียกใช้งาน</p></div><button type="button" onClick={() => onOpenChange(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.06] text-slate-500 hover:text-white" aria-label="ปิดสถานะระบบ"><ChevronDown className="h-3.5 w-3.5 rotate-180" /></button></div>
          <div className="mt-4 grid gap-2">
            {Object.entries(checkNames).map(([key, name]) => {
              const ok = Boolean(health?.checks?.[key]) && !unavailable;
              return <div key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.055] bg-black/15 px-3"><span className={`grid h-7 w-7 place-items-center rounded-lg ${ok ? 'bg-emerald-300/[0.08] text-emerald-300' : 'bg-rose-300/[0.08] text-rose-300'}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}</span><span className="flex-1 text-[11px] font-semibold text-slate-300">{name}</span><span className={`font-mono text-[8px] font-bold ${ok ? 'text-emerald-300/70' : 'text-rose-300/70'}`}>{ok ? (key === 'gemini' ? 'CONFIGURED' : 'READY') : 'CHECK'}</span></div>;
            })}
          </div>
          {health?.blockers?.length ? <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-3 text-[10px] leading-5 text-rose-200"><ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" />พบตัวบล็อกการทำงาน {health.blockers.length} รายการ กรุณาตรวจหน้า Health และการตั้งค่าระบบ</div> : null}
          <footer className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 font-mono text-[8px] text-slate-600"><span>{health?.timestamp ? new Date(health.timestamp).toLocaleString('th-TH') : 'กำลังตรวจสอบ…'}</span><RefreshCw className="h-3 w-3" /></footer>
        </section>, document.body) : null}
    </div>
  );
}
