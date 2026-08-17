'use client';

import React, { useState, useSyncExternalStore } from 'react';
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
  Fingerprint,
  History,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  Sparkles,
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
  { name: 'คลังหลักฐาน', href: '/evidence', icon: FileSearch },
];

const intelligenceNav: NavItem[] = [
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
      className={`group relative flex min-h-11 items-center rounded-xl px-3 text-sm font-medium transition-[background,color,transform] duration-200 ${active ? 'bg-teal-300/[0.11] text-teal-100' : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100'} ${collapsed ? 'justify-center' : ''}`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-teal-300" />}
      <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105 ${active ? 'text-teal-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
      {!collapsed && (
        <>
          <span className="ml-3 truncate">{item.name}</span>
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
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getServerAuthSnapshot);
  const [userRole, userName] = authSnapshot.split('\u0000');

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
      <div className={`flex h-[76px] items-center border-b border-white/[0.06] ${collapsed ? 'justify-center px-3' : 'px-5'}`}>
        <Link href="/" onClick={onNavigate} className="flex min-w-0 items-center gap-3" aria-label="EvidenceVerse หน้าหลัก">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-teal-300/20 bg-teal-300/10 text-teal-300 shadow-[0_0_32px_rgba(45,212,191,0.08)]">
            <Fingerprint className="h-5 w-5" />
            <span className="status-pulse absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-teal-300 text-teal-300" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block text-[17px] font-bold tracking-[-0.02em] text-white">EvidenceVerse</span>
              <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.2em] text-teal-300/70">National Intelligence</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="เมนูหลัก">
        {renderNavGroup('ปฏิบัติการ', primaryNav, collapsed, onNavigate)}
        {renderNavGroup('วิเคราะห์และตรวจทาน', intelligenceNav, collapsed, onNavigate)}
        {renderNavGroup('กำกับดูแล', governanceNav, collapsed, onNavigate)}
        {isAdmin && renderNavGroup('ระบบ', [{ name: 'ตั้งค่าและสิทธิ์', href: '/admin/settings', icon: Settings }], collapsed, onNavigate)}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className={`mb-2 flex items-center rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300"><CircleUserRound className="h-[18px] w-[18px]" /></span>
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
      <aside className={`relative z-20 hidden shrink-0 flex-col border-r border-white/[0.06] bg-[#07121f]/95 shadow-2xl shadow-black/10 backdrop-blur-xl transition-[width] duration-300 lg:flex ${isCollapsed ? 'w-[76px]' : 'w-[272px]'}`}>
        {sidebarContent()}
        <button type="button" onClick={() => setIsCollapsed((value) => !value)} className="absolute -right-3 top-[92px] grid h-7 w-7 place-items-center rounded-full border border-slate-700/80 bg-[#0c1a2b] text-slate-500 shadow-lg transition-colors hover:text-teal-300" aria-label={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}>
          <PanelLeftClose className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col" inert={isMobileMenuOpen ? true : undefined}>
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#081421]/72 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setIsMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 lg:hidden" aria-label="เปิดเมนูหลัก" aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300/70">{meta.eyebrow}</p><h2 className="truncate text-base font-semibold text-slate-100 sm:text-lg">{meta.title}</h2></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-[10px] font-medium text-emerald-300 sm:flex"><ShieldCheck className="h-3.5 w-3.5" /><span>โหมดตรวจสอบย้อนกลับ</span></div>
            <Link href="/intake" aria-label="เปิดคิวแจ้งเตือน" className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-400 transition-colors hover:text-slate-100"><Bell className="h-[18px] w-[18px]" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-300 ring-2 ring-[#0a1725]" /></Link>
          </div>
        </header>

        <main id="main-content" className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div key={pathname} className="page-enter mx-auto w-full max-w-[1440px] space-y-8">{children}</div>
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" id="mobile-navigation">
          <button type="button" aria-label="ปิดเมนูหลัก" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="เมนูหลัก" className="absolute inset-y-0 left-0 flex w-[min(88vw,330px)] flex-col border-r border-white/[0.08] bg-[#07121f] shadow-2xl animate-[rise-in_260ms_ease-out]">
            <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="absolute right-4 top-5 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400" aria-label="ปิดเมนู"><X className="h-4 w-4" /></button>
            {sidebarContent(() => setIsMobileMenuOpen(false), true)}
          </aside>
        </div>
      )}
    </div>
  );
}
