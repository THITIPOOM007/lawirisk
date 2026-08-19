'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  CircleUserRound,
  Database,
  FileBarChart,
  FileSearch,
  History,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  PanelLeftClose,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { roleLabel } from '@/lib/roles';

interface NavigationProps {
  children: React.ReactNode;
}

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primaryNav: NavItem[] = [
  { name: 'ภาพรวมศูนย์บัญชาการ', href: '/', icon: LayoutDashboard },
  { name: 'คิวคัดกรองคำร้อง', href: '/intake', icon: Inbox },
  { name: 'สำนวนคดี', href: '/cases', icon: BriefcaseBusiness },
  { name: 'แหล่งสืบค้น', href: '/sources', icon: ScanSearch },
  { name: 'คลังหลักฐาน', href: '/evidence', icon: FileSearch },
];

const intelligenceNav: NavItem[] = [
  { name: 'ศูนย์งานอัตโนมัติ', href: '/automation', icon: Workflow },
  { name: 'ข้อเสนอจาก AI', href: '/review', icon: Sparkles },
  { name: 'ทะเบียนข้อมูล', href: '/entities', icon: Database },
  { name: 'ความเชื่อมโยง', href: '/matches', icon: Link2 },
  { name: 'รายงานตรวจสอบย้อนกลับ', href: '/reports', icon: FileBarChart },
];

const governanceNav: NavItem[] = [
  { name: 'บันทึกการตรวจสอบ', href: '/audit', icon: History },
];

const sectionMeta = [
  { prefix: '/intake', eyebrow: 'Intake & Triage', title: 'คัดกรองคำร้อง' },
  { prefix: '/cases/new', eyebrow: 'Case workspace', title: 'สร้างสำนวนคดี' },
  { prefix: '/cases', eyebrow: 'Case workspace', title: 'สำนวนคดี' },
  { prefix: '/evidence', eyebrow: 'Evidence custody', title: 'คลังหลักฐาน' },
  { prefix: '/sources', eyebrow: 'Authorized sources', title: 'แหล่งสืบค้น' },
  { prefix: '/automation', eyebrow: 'n8n orchestration', title: 'ศูนย์งานอัตโนมัติ' },
  { prefix: '/review', eyebrow: 'Human review', title: 'ข้อเสนอจาก AI' },
  { prefix: '/entities', eyebrow: 'Data registry', title: 'ทะเบียนข้อมูล' },
  { prefix: '/matches', eyebrow: 'Cross-case analysis', title: 'ความเชื่อมโยง' },
  { prefix: '/reports', eyebrow: 'Traceable outputs', title: 'รายงาน' },
  { prefix: '/audit', eyebrow: 'Governance', title: 'บันทึกการตรวจสอบ' },
  { prefix: '/admin', eyebrow: 'Administration', title: 'ตั้งค่าระบบ' },
];

const subscribeToAuth = (onStoreChange: () => void) => {
  window.addEventListener('ev-auth-change', onStoreChange);
  return () => window.removeEventListener('ev-auth-change', onStoreChange);
};

const readCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
};

const getAuthSnapshot = () => {
  const role = readCookie('mock-auth-role') || 'VIEWER';
  const encodedName = readCookie('mock-auth-name');
  const name = encodedName ? decodeURIComponent(encodedName) : 'เจ้าหน้าที่ตรวจสอบ';
  return `${role}\u0000${name}`;
};

const getServerAuthSnapshot = () => 'VIEWER\u0000เจ้าหน้าที่ตรวจสอบ';
const subscribeToHydration = () => () => {};

function NavLink({ item, active, collapsed, onNavigate }: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.name : undefined}
      className={`group relative flex min-h-11 items-center overflow-hidden rounded-xl px-3 text-sm font-medium transition-[background,color,transform,border-color] duration-300 ease-out ${active ? 'nav-active-glow border border-teal-300/10 bg-gradient-to-r from-teal-300/[0.13] to-sky-300/[0.035] text-teal-50' : 'border border-transparent text-slate-400 hover:translate-x-0.5 hover:border-white/[0.055] hover:bg-white/[0.04] hover:text-slate-100'} ${collapsed ? 'justify-center' : ''}`}
    >
      {active && <><span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-teal-300 shadow-[0_0_18px_rgba(66,232,206,0.9)]" /><span className="absolute -left-6 h-12 w-12 rounded-full bg-teal-300/10 blur-xl" /></>}
      <Icon className={`relative h-[18px] w-[18px] shrink-0 transition-transform duration-300 ease-out group-hover:scale-110 ${active ? 'text-teal-300 drop-shadow-[0_0_8px_rgba(66,232,206,0.25)]' : 'text-slate-500 group-hover:text-slate-300'}`} />
      {!collapsed && (
        <>
          <span className="relative ml-3 truncate">{item.name}</span>
          <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-all ${active ? 'translate-x-0 opacity-70' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60'}`} />
        </>
      )}
    </Link>
  );
}

export default function Navigation({ children }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const mobileDialogRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getServerAuthSnapshot);
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [demoRole, demoName] = authSnapshot.split('\u0000');
  const [serverIdentity, setServerIdentity] = useState<{ name: string; role: string } | null>(null);
  const usesSupabase = isSupabaseConfigured();

  useEffect(() => {
    if (!usesSupabase) return;
    const controller = new AbortController();
    fetch('/api/v1/me', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => { if (body?.data) setServerIdentity({ name: body.data.name, role: body.data.role }); })
      .catch((caught: unknown) => { if (!(caught instanceof DOMException && caught.name === 'AbortError')) console.error('Identity load failed'); });
    return () => controller.abort();
  }, [usesSupabase]);

  const userRole = usesSupabase ? serverIdentity?.role || 'VIEWER' : demoRole;
  const userName = usesSupabase ? serverIdentity?.name || 'กำลังโหลดข้อมูลผู้ใช้…' : demoName;

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const dialog = mobileDialogRef.current;
    const menuButton = mobileMenuButtonRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) || []);
    getFocusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      menuButton?.focus();
    };
  }, [isMobileMenuOpen]);

  if (pathname === '/login') return <>{children}</>;

  const isAdmin = userRole === 'ADMIN';
  const meta = sectionMeta.find((item) => pathname.startsWith(item.prefix)) || { eyebrow: 'National command center', title: 'ภาพรวมระบบ' };
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      if (isSupabaseConfigured()) await createClient().auth.signOut();
      for (const name of ['mock-auth-logged-in', 'mock-auth-role', 'mock-auth-name']) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      }
      window.dispatchEvent(new Event('ev-auth-change'));
      router.replace('/login');
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  };

  const renderNavGroup = (label: string, items: NavItem[], collapsed: boolean, onNavigate?: () => void) => (
    <div className="space-y-1">
      {!collapsed && <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{label}</p>}
      {items.map((item) => <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />)}
    </div>
  );

  const sidebarContent = (onNavigate?: () => void, forceExpanded = false) => {
    const collapsed = forceExpanded ? false : isCollapsed;
    return (
    <>
      <div className={`flex h-20 items-center border-b border-white/[0.055] ${collapsed ? 'justify-center px-3' : 'px-5'}`}>
        <Link href="/" onClick={onNavigate} className="flex min-w-0 items-center gap-3" aria-label="LawiRisk-SSK หน้าหลัก">
          <span className="floating-orb relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-200/30 bg-gradient-to-br from-cyan-300/20 via-[#020b18] to-amber-300/20 shadow-[0_0_38px_rgba(34,211,238,0.15),0_0_42px_rgba(251,191,36,0.06),inset_0_1px_rgba(255,255,255,0.14)]">
            <span className="absolute inset-px rounded-[15px] bg-[#020b18]/92" />
            <Image src="/lawirisk-ssk-mark-v2.png" alt="" width={48} height={44} className="relative z-10 h-full w-full object-contain p-1.5" priority />
            <span className="status-pulse absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-teal-300 text-teal-300" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-200 bg-clip-text text-[18px] font-black tracking-[-0.035em] text-transparent">LawiRisk-SSK</span>
              <span className="block truncate text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-200/70">Evidence Intelligence</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-5" aria-label="เมนูหลัก">
        {renderNavGroup('ปฏิบัติการ', primaryNav, collapsed, onNavigate)}
        {renderNavGroup('วิเคราะห์และตรวจทาน', intelligenceNav, collapsed, onNavigate)}
        {renderNavGroup('กำกับดูแล', governanceNav, collapsed, onNavigate)}
        {isAdmin && renderNavGroup('ระบบ', [{ name: 'ตั้งค่าและสิทธิ์', href: '/admin/settings', icon: Settings }], collapsed, onNavigate)}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className={`mb-2 flex items-center rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.045] to-transparent p-2.5 shadow-[inset_0_1px_rgba(255,255,255,0.025)] ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-slate-800/80 text-slate-300"><CircleUserRound className="h-[18px] w-[18px]" /></span>
          {!collapsed && <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-100">{userName}</span><span className="block truncate text-[10px] text-slate-500">{roleLabel(userRole)}</span></span>}
        </div>
        <button type="button" onClick={handleLogout} disabled={isSigningOut} title={collapsed ? 'ออกจากระบบ' : undefined} className={`flex min-h-10 w-full items-center rounded-xl px-3 text-xs font-medium text-slate-500 transition-colors hover:bg-rose-400/[0.07] hover:text-rose-300 disabled:opacity-50 ${collapsed ? 'justify-center' : ''}`}>
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2.5">{isSigningOut ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</span>}
        </button>
      </div>
    </>
    );
  };

  return (
    <div className="app-backdrop relative flex h-dvh min-h-[640px] overflow-hidden text-slate-100">
      <a href="#main-content" className="sr-only z-[100] rounded-lg bg-teal-300 px-4 py-2 font-bold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">ข้ามไปยังเนื้อหาหลัก</a>
      <aside className={`nav-rail relative z-20 hidden shrink-0 flex-col border-r border-white/[0.055] transition-[width] duration-500 [transition-timing-function:var(--ease-out-expo)] lg:flex ${isCollapsed ? 'w-[80px]' : 'w-[280px]'}`}>
        {sidebarContent()}
        <button type="button" onClick={() => setIsCollapsed((value) => !value)} className="absolute -right-3.5 top-[98px] grid h-8 w-8 place-items-center rounded-full border border-white/[0.1] bg-[#0b1a29]/95 text-slate-500 shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all duration-300 hover:scale-110 hover:border-teal-300/20 hover:text-teal-300" aria-label={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}>
          <PanelLeftClose className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col" inert={isMobileMenuOpen ? true : undefined}>
        <header className="relative flex h-20 shrink-0 items-center justify-between border-b border-white/[0.055] bg-[#06111d]/55 px-4 shadow-[0_16px_50px_rgba(0,4,12,0.08)] backdrop-blur-2xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={mobileMenuButtonRef} type="button" disabled={!isHydrated} onClick={() => setIsMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 disabled:cursor-wait disabled:opacity-60 lg:hidden" aria-label="เปิดเมนูหลัก" aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-[0.22em] text-teal-300/65">{meta.eyebrow}</p><h2 className="mt-0.5 truncate text-base font-semibold tracking-[-0.015em] text-slate-100 sm:text-lg">{meta.title}</h2></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.055] px-3 py-1.5 text-[10px] font-medium text-emerald-200 shadow-[inset_0_1px_rgba(255,255,255,0.04)] sm:flex"><span className="status-pulse h-1.5 w-1.5 rounded-full bg-emerald-300 text-emerald-300" /><ShieldCheck className="h-3.5 w-3.5" /><span>Traceable workspace</span></div>
            <Link href="/intake" aria-label="เปิดคิวรับเรื่อง" className="secondary-action relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] text-slate-400 hover:text-slate-100"><Bell className="h-[18px] w-[18px]" /></Link>
          </div>
        </header>

        <main id="main-content" className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-9 lg:py-9 xl:px-11">
          <div key={pathname} className="page-enter mx-auto w-full max-w-[1480px] space-y-8">{children}</div>
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" id="mobile-navigation">
          <button type="button" aria-label="ปิดเมนูหลัก" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <aside ref={mobileDialogRef} role="dialog" aria-modal="true" aria-label="เมนูหลัก" className="nav-rail absolute inset-y-0 left-0 flex w-[min(88vw,330px)] flex-col border-r border-white/[0.08] shadow-2xl animate-[drawer-enter_420ms_var(--ease-out-expo)]">
            <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="absolute right-4 top-5 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400" aria-label="ปิดเมนู"><X className="h-4 w-4" /></button>
            {sidebarContent(() => setIsMobileMenuOpen(false), true)}
          </aside>
        </div>
      )}
    </div>
  );
}
