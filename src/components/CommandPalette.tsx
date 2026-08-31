'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search, Sparkles, X } from 'lucide-react';

export type CommandPaletteItem = {
  name: string;
  href: string;
  section: string;
  keywords?: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function CommandPalette({
  open,
  items,
  onOpenChange,
}: {
  open: boolean;
  items: CommandPaletteItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('th-TH');
    if (!normalized) return items;
    return items.filter((item) => `${item.name} ${item.section} ${item.keywords || ''}`.toLocaleLowerCase('th-TH').includes(normalized));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const close = () => {
    setQuery('');
    setActiveIndex(0);
    onOpenChange(false);
  };

  const execute = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-[#01050b]/75 px-3 pt-[10vh] backdrop-blur-xl sm:px-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="ศูนย์คำสั่งลัด"
        className="command-deck relative w-full max-w-2xl overflow-hidden rounded-[28px]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
          if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => filtered.length ? (value + 1) % filtered.length : 0); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => filtered.length ? (value - 1 + filtered.length) % filtered.length : 0); }
          if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); execute(filtered[activeIndex].href); }
        }}
      >
        <div aria-hidden="true" className="scan-line opacity-50" />
        <header className="relative flex items-center gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-teal-300/20 bg-teal-300/[0.08] text-teal-200 shadow-[0_0_30px_rgba(45,212,191,0.1)]"><Search className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <label htmlFor="command-search" className="sr-only">ค้นหาระบบหรือคำสั่ง</label>
            <input ref={inputRef} id="command-search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="ค้นหาระบบ งาน หรือข้อมูลที่ต้องการ…" autoComplete="off" className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-600 sm:text-lg" />
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-teal-300/55">Evidence operations command interface</p>
          </div>
          <button type="button" onClick={close} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-slate-500 transition hover:text-white" aria-label="ปิดศูนย์คำสั่ง"><X className="h-4 w-4" /></button>
        </header>

        <div className="relative max-h-[55vh] overflow-y-auto p-2 sm:p-3" role="listbox" aria-label="ผลการค้นหาระบบ">
          {filtered.length ? filtered.map((item, index) => {
            const Icon = item.icon;
            const active = index === activeIndex;
            return (
              <button key={`${item.href}:${item.name}`} type="button" role="option" aria-selected={active} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(item.href)} className={`group flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3 text-left transition sm:px-4 ${active ? 'border-teal-300/20 bg-gradient-to-r from-teal-300/[0.11] to-indigo-300/[0.045] text-white shadow-[inset_0_1px_rgba(255,255,255,0.04),0_12px_30px_rgba(0,0,0,0.18)]' : 'border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-100'}`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${active ? 'border-teal-300/20 bg-teal-300/[0.09] text-teal-200' : 'border-white/[0.06] bg-white/[0.025] text-slate-500'}`}><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-600">{item.section} · {item.href}</span></span>
                {active ? <span className="hidden items-center gap-1 rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1 font-mono text-[9px] text-slate-400 sm:inline-flex"><CornerDownLeft className="h-3 w-3" /> ENTER</span> : <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-60" />}
              </button>
            );
          }) : <div className="grid min-h-48 place-items-center p-6 text-center"><div><Sparkles className="mx-auto h-7 w-7 text-slate-700" /><p className="mt-3 text-sm font-bold text-slate-400">ไม่พบคำสั่งที่ตรงกัน</p><p className="mt-1 text-xs text-slate-600">ลองค้นด้วยชื่อระบบ เช่น หลักฐาน รายงาน หรือสำนวน</p></div></div>}
        </div>
        <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-black/15 px-4 py-3 font-mono text-[9px] text-slate-600 sm:px-5"><span>↑↓ เลือก · ENTER เปิด · ESC ปิด</span><span className="text-teal-300/45">SOURCE-BOUND WORKSPACE</span></footer>
      </section>
    </div>
  );
}
