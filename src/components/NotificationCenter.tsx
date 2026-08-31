'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Bell,
  BellRing,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  FileWarning,
  Inbox,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { NotificationItem } from '@/lib/notification-center';

type NotificationPayload = {
  items: NotificationItem[];
  unread_count: number;
  mode: 'demo' | 'production';
  partial: boolean;
  unavailable_sources: string[];
  generated_at: string;
};

const kindIcons = { intake: Inbox, review: Sparkles, automation: Bot, evidence: FileWarning };
const toneClasses = {
  critical: 'border-rose-300/20 bg-rose-300/[0.07] text-rose-200',
  warning: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200',
  info: 'border-sky-300/20 bg-sky-300/[0.07] text-sky-200',
  success: 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200',
};

function relativeTime(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return new Date(value).toLocaleString('th-TH');
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function NotificationCenter({
  open,
  onOpenChange,
  storageScope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storageScope: string;
}) {
  const [payload, setPayload] = useState<NotificationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const localKey = `lawirisk-notification-reads:${storageScope}`;

  const applyDemoReads = useCallback((next: NotificationPayload) => {
    if (next.mode !== 'demo') return next;
    let saved = new Set<string>();
    try { saved = new Set(JSON.parse(localStorage.getItem(localKey) || '[]') as string[]); } catch {}
    const items = next.items.map((item) => ({ ...item, read: item.read || saved.has(item.id) }));
    return { ...next, items, unread_count: items.filter((item) => !item.read).length };
  }, [localKey]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/v1/notifications', { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json().catch(() => null) as { data?: NotificationPayload; error?: { message?: string } } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message || 'โหลดศูนย์แจ้งเตือนไม่สำเร็จ');
      setPayload(applyDemoReads(body.data));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดศูนย์แจ้งเตือนไม่สำเร็จ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyDemoReads]);

  useEffect(() => {
    const controller = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => { window.clearTimeout(controller); window.clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', escape); };
  }, [open, onOpenChange]);

  const markRead = async (ids: string[]) => {
    if (!ids.length || !payload) return;
    const previous = payload;
    const idSet = new Set(ids);
    const items = payload.items.map((item) => idSet.has(item.id) ? { ...item, read: true } : item);
    setPayload({ ...payload, items, unread_count: items.filter((item) => !item.read).length });
    if (payload.mode === 'demo') {
      try {
        const saved = new Set(JSON.parse(localStorage.getItem(localKey) || '[]') as string[]);
        ids.forEach((id) => saved.add(id));
        localStorage.setItem(localKey, JSON.stringify([...saved].slice(-500)));
      } catch {}
      return;
    }
    try {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error('MARK_READ_FAILED');
    } catch {
      setPayload(previous);
      setError('บันทึกสถานะอ่านแล้วไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const unreadCount = payload?.unread_count || 0;
  const visibleItems = useMemo(() => payload?.items.filter((item) => tab === 'all' || !item.read) || [], [payload, tab]);
  const panel = open ? (
    <section
      ref={panelRef}
      id="notification-center-panel"
      role="dialog"
      aria-label="ศูนย์แจ้งเตือน"
      tabIndex={-1}
      className="notification-center fixed z-[80] overflow-hidden rounded-[26px] outline-none"
    >
      <header className="relative border-b border-white/[0.07] px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-teal-300/20 bg-teal-300/[0.08] text-teal-200"><BellRing className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal-300/60">Operational notification stream</p><h3 className="mt-1 text-base font-black text-white">ศูนย์แจ้งเตือนและงานที่ต้องดำเนินการ</h3><p className="mt-1 text-[11px] text-slate-500">สร้างจากรายการที่คุณมีสิทธิ์เข้าถึงในระบบจริง</p></div>
          <button type="button" onClick={() => onOpenChange(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:text-white" aria-label="ปิดศูนย์แจ้งเตือน"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => setTab('unread')} className={`min-h-9 rounded-xl border px-3 text-xs font-bold transition ${tab === 'unread' ? 'border-teal-300/20 bg-teal-300/[0.09] text-teal-100' : 'border-white/[0.06] text-slate-500 hover:text-slate-200'}`}>ยังไม่ได้อ่าน <span className="ml-1 font-mono text-[10px]">{unreadCount}</span></button>
          <button type="button" onClick={() => setTab('all')} className={`min-h-9 rounded-xl border px-3 text-xs font-bold transition ${tab === 'all' ? 'border-teal-300/20 bg-teal-300/[0.09] text-teal-100' : 'border-white/[0.06] text-slate-500 hover:text-slate-200'}`}>ทั้งหมด</button>
          <button type="button" disabled={!unreadCount} onClick={() => void markRead(payload?.items.filter((item) => !item.read).map((item) => item.id) || [])} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-bold text-slate-500 transition hover:bg-white/[0.04] hover:text-teal-200 disabled:cursor-not-allowed disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />อ่านแล้วทั้งหมด</button>
        </div>
      </header>

      <div className="notification-stream overflow-y-auto p-2.5 sm:p-3" aria-live="polite" aria-busy={loading || refreshing}>
        {loading ? <div className="grid min-h-56 place-items-center text-center"><div><LoaderCircle className="mx-auto h-7 w-7 animate-spin text-teal-300" /><p className="mt-3 text-xs font-semibold text-slate-400">กำลังรวบรวมรายการแจ้งเตือน…</p></div></div> : null}
        {!loading && error && !payload ? <div className="grid min-h-56 place-items-center px-6 text-center"><div><ShieldAlert className="mx-auto h-7 w-7 text-rose-300" /><p className="mt-3 text-sm font-bold text-rose-100">โหลดรายการไม่สำเร็จ</p><p className="mt-1 text-xs leading-5 text-slate-500">{error}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-bold text-slate-300"><RefreshCw className="h-3.5 w-3.5" />ลองใหม่</button></div></div> : null}
        {!loading && payload?.partial ? <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-3 py-2 text-[10px] leading-5 text-amber-100"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />ข้อมูลบางส่วนยังโหลดไม่ได้ ({payload.unavailable_sources.length} แหล่ง) รายการที่แสดงอาจยังไม่ครบ</div> : null}
        {!loading && error && payload ? <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-100"><span>{error}</span><button type="button" onClick={() => void load(true)} className="font-bold underline">ลองใหม่</button></div> : null}
        {!loading && payload && !visibleItems.length ? <div className="grid min-h-56 place-items-center px-6 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-300"><CheckCheck className="h-6 w-6" /></span><p className="mt-4 text-sm font-black text-slate-200">{tab === 'unread' ? 'อ่านรายการสำคัญครบแล้ว' : 'ยังไม่มีรายการแจ้งเตือน'}</p><p className="mt-1 text-xs leading-5 text-slate-500">ระบบจะรวบรวมงานคัดกรอง งานตรวจทาน งานอัตโนมัติ และความเสี่ยงของหลักฐานไว้ที่นี่</p></div></div> : null}
        {!loading && visibleItems.map((item) => {
          const Icon = kindIcons[item.kind];
          return <Link key={item.id} href={item.href} onClick={() => { void markRead([item.id]); onOpenChange(false); }} className={`group mb-2 flex gap-3 rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:border-teal-300/20 hover:bg-white/[0.045] ${item.read ? 'border-white/[0.045] bg-white/[0.015] opacity-65' : 'border-white/[0.075] bg-white/[0.032]'}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClasses[item.severity]}`}><Icon className="h-[17px] w-[17px]" /></span>
            <span className="min-w-0 flex-1"><span className="flex items-start gap-2"><span className="flex-1 text-xs font-black leading-5 text-slate-100">{item.title}</span>{!item.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-300 shadow-[0_0_9px_rgba(94,234,212,.75)]" aria-label="ยังไม่ได้อ่าน" /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />}</span><span className="mt-1 block text-[10px] leading-[1.55] text-slate-500">{item.summary}</span><span className="mt-2 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-650"><span>{item.source}</span><span>·</span><span>{relativeTime(item.occurred_at)}</span></span></span>
            <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-teal-300" />
          </Link>;
        })}
      </div>
      <footer className="flex items-center justify-between border-t border-white/[0.06] bg-black/15 px-4 py-3 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600 sm:px-5"><span>{payload?.generated_at ? `อัปเดต ${new Date(payload.generated_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'กำลังเชื่อมต่อ'}</span><button type="button" disabled={refreshing} onClick={() => void load(true)} className="inline-flex items-center gap-1.5 text-teal-300/60 hover:text-teal-200 disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />รีเฟรช</button></footer>
    </section>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={unreadCount ? `เปิดศูนย์แจ้งเตือน มี ${unreadCount} รายการที่ยังไม่ได้อ่าน` : 'เปิดศูนย์แจ้งเตือน'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notification-center-panel"
        className="secondary-action relative grid h-10 w-10 shrink-0 overflow-visible place-items-center rounded-xl border border-white/[0.08] text-slate-400 hover:text-slate-100"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 ? <span data-testid="notification-unread-badge" className="absolute right-0.5 top-0.5 z-20 inline-flex h-[18px] min-w-[18px] items-center justify-center whitespace-nowrap rounded-full border-2 border-[#071522] bg-rose-400 px-1 font-mono text-[8px] font-black leading-none text-white shadow-[0_0_12px_rgba(251,113,133,.5)]" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
