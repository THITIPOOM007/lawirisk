'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpenText,
  BriefcaseBusiness,
  ChevronRight,
  CircleUserRound,
  Database,
  FileBarChart,
  FileSearch,
  Fingerprint,
  Globe,
  History,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  ScanSearch,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Type,
  Workflow,
  X,
} from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { roleLabel } from '@/lib/roles';
import GuideAssistant from '@/components/GuideAssistant';
import { CommandPalette, type CommandPaletteItem } from '@/components/CommandPalette';
import { SystemPulse } from '@/components/SystemPulse';
import { NotificationCenter } from '@/components/NotificationCenter';
import StaffSatisfactionPrompt from '@/components/StaffSatisfactionPrompt';

interface NavigationProps {
  children: React.ReactNode;
}

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primaryNav: NavItem[] = [
  { name: 'ภาพรวมระบบ', href: '/', icon: LayoutDashboard },
  { name: 'รายการรับเรื่องและคัดกรอง', href: '/intake', icon: Inbox },
  { name: 'สำนวนคดีสืบสวน', href: '/cases', icon: BriefcaseBusiness },
  { name: 'แหล่งสืบค้นข้อมูล', href: '/sources', icon: ScanSearch },
  { name: 'คลังหลักฐานดิจิทัล', href: '/evidence', icon: FileSearch },
];

const intelligenceNav: NavItem[] = [
  { name: 'ระบบงานอัตโนมัติ', href: '/automation', icon: Workflow },
  { name: 'ผลการวิเคราะห์และข้อเสนอแนะ', href: '/review', icon: Sparkles },
  { name: 'ทะเบียนข้อมูลบุคคล/นิติบุคคล', href: '/entities', icon: Database },
  { name: 'การวิเคราะห์ความเชื่อมโยง', href: '/matches', icon: Link2 },
  { name: 'ผังความเชื่อมโยง 3 มิติ', href: '/universe', icon: Network },
  { name: 'รายงานสรุปสำนวนคดี', href: '/reports', icon: FileBarChart },
];

const governanceNav: NavItem[] = [
  { name: 'คู่มือการใช้งาน', href: '/guide', icon: BookOpenText },
  { name: 'บันทึกประวัติการใช้งาน', href: '/audit', icon: History },
  { name: 'ความพึงพอใจของผู้ใช้งาน', href: '/satisfaction', icon: HeartHandshake },
  { name: 'Passkey และการสแกนชีวมิติ', href: '/security', icon: Fingerprint },
  { name: 'บริการรับเรื่องสำหรับประชาชน', href: '/public', icon: Globe },
];

const sectionMeta = [
  { prefix: '/intake', eyebrow: 'การคัดกรองเบาะแส', title: 'รายการรับเรื่องและคัดกรอง' },
  { prefix: '/cases/new', eyebrow: 'การบริหารจัดการคดี', title: 'ลงทะเบียนสำนวนคดีใหม่' },
  { prefix: '/cases', eyebrow: 'การบริหารจัดการคดี', title: 'ทะเบียนสำนวนคดีสืบสวน' },
  { prefix: '/evidence', eyebrow: 'การคุ้มครองหลักฐานดิจิทัล', title: 'คลังหลักฐานดิจิทัล' },
  { prefix: '/sources', eyebrow: 'การเชื่อมต่อระบบภายนอก', title: 'แหล่งสืบค้นข้อมูลที่ได้รับอนุญาต' },
  { prefix: '/automation', eyebrow: 'ระบบประมวลผลอัตโนมัติ', title: 'ศูนย์สั่งการระบบงานอัตโนมัติ' },
  { prefix: '/review', eyebrow: 'การตรวจทานโดยเจ้าหน้าที่', title: 'ผลการวิเคราะห์และข้อเสนอแนะ' },
  { prefix: '/entities', eyebrow: 'ฐานข้อมูลกลาง', title: 'ทะเบียนข้อมูลบุคคลและนิติบุคคล' },
  { prefix: '/matches', eyebrow: 'การวิเคราะห์ข้อมูลเชิงลึก', title: 'การวิเคราะห์ความเชื่อมโยงข้ามคดี' },
  { prefix: '/universe', eyebrow: 'ผังเครือข่ายความสัมพันธ์', title: 'ผังความเชื่อมโยง 3 มิติ (3D Graph)' },
  { prefix: '/reports', eyebrow: 'เอกสารสรุปสำนวนคดี', title: 'รายงานและเอกสารสืบสวน' },
  { prefix: '/audit', eyebrow: 'ธรรมาภิบาลและความโปร่งใส', title: 'บันทึกประวัติการใช้งาน (Audit Log)' },
  { prefix: '/satisfaction', eyebrow: 'การพัฒนาคุณภาพบริการ', title: 'ความพึงพอใจของผู้ใช้งาน' },
  { prefix: '/guide', eyebrow: 'ศูนย์การเรียนรู้', title: 'คู่มือการใช้งาน LawiRisk-SSK' },
  { prefix: '/security', eyebrow: 'ความปลอดภัยบัญชีผู้ใช้', title: 'Passkey และการสแกนชีวมิติ' },
  { prefix: '/admin', eyebrow: 'การบริหารระบบ', title: 'การตั้งค่าและกำหนดสิทธิ์ผู้ใช้งาน' },
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
  const role = readCookie('mock-auth-role') || 'INVESTIGATOR';
  const encodedName = readCookie('mock-auth-name');
  const name = encodedName ? decodeURIComponent(encodedName) : 'ร.ต.อ. สมชาย (พนักงานสืบสวน)';
  return `${role}\u0000${name}`;
};

const getServerAuthSnapshot = () => 'INVESTIGATOR\u0000ร.ต.อ. สมชาย (พนักงานสืบสวน)';
const subscribeToTheme = (onStoreChange: () => void) => {
  window.addEventListener('ev-theme-change', onStoreChange);
  return () => window.removeEventListener('ev-theme-change', onStoreChange);
};

const getThemeSnapshot = () => {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('lawirisk-theme') as 'dark' | 'light') || 'dark';
};

const getServerThemeSnapshot = () => 'dark';

const getTextSizeSnapshot = () => {
  if (typeof window === 'undefined') return 'standard';
  return (localStorage.getItem('lawirisk-text-size') as 'standard' | 'large') || 'standard';
};

const getServerTextSizeSnapshot = () => 'standard';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [activeHeaderPanel, setActiveHeaderPanel] = useState<'system' | 'notifications' | null>(null);
  const mobileDialogRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getServerAuthSnapshot);
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const textSize = useSyncExternalStore(subscribeToTheme, getTextSizeSnapshot, getServerTextSizeSnapshot);
  const [demoRole, demoName] = authSnapshot.split('\u0000');
  const [serverIdentity, setServerIdentity] = useState<{ name: string; role: string } | null>(null);
  const usesSupabase = isSupabaseConfigured();

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/public')) return;
    const openCommand = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('en-US') === 'k') {
        event.preventDefault();
        setActiveHeaderPanel(null);
        setIsCommandOpen(true);
      }
    };
    window.addEventListener('keydown', openCommand);
    return () => window.removeEventListener('keydown', openCommand);
  }, [pathname]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('lawirisk-theme', nextTheme);
      if (nextTheme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      }
      window.dispatchEvent(new Event('ev-theme-change'));
    } catch {}
  };

  const toggleTextSize = () => {
    const nextSize = textSize === 'standard' ? 'large' : 'standard';
    try {
      localStorage.setItem('lawirisk-text-size', nextSize);
      if (nextSize === 'large') {
        document.documentElement.classList.add('text-size-lg');
      } else {
        document.documentElement.classList.remove('text-size-lg');
      }
      window.dispatchEvent(new Event('ev-theme-change'));
    } catch {}
  };

  useEffect(() => {
    if (!usesSupabase || pathname.startsWith('/public')) return;
    const controller = new AbortController();
    fetch('/api/v1/me', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => { if (body?.data) setServerIdentity({ name: body.data.name, role: body.data.role }); })
      .catch((caught: unknown) => { if (!(caught instanceof DOMException && caught.name === 'AbortError')) console.error('Identity load failed'); });
    return () => controller.abort();
  }, [pathname, usesSupabase]);

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

  if (pathname === '/login' || pathname.startsWith('/public')) return <>{children}</>;

  const isAdmin = userRole === 'ADMIN';
  const meta = sectionMeta.find((item) => pathname.startsWith(item.prefix)) || { eyebrow: 'National command center', title: 'ภาพรวมระบบ' };
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  const commandItems: CommandPaletteItem[] = [
    ...primaryNav.map((item) => ({ ...item, section: 'ปฏิบัติการ', keywords: 'ค้นหา เปิดระบบ งานหลัก' })),
    ...intelligenceNav.map((item) => ({ ...item, section: 'วิเคราะห์และตรวจทาน', keywords: 'วิเคราะห์ AI เชื่อมโยง รายงาน' })),
    ...governanceNav.map((item) => ({ ...item, section: 'กำกับดูแล', keywords: 'คู่มือ audit ความปลอดภัย' })),
    ...(isAdmin ? [{ name: 'ตั้งค่าและกำหนดสิทธิ์', href: '/admin/settings', icon: Settings, section: 'ระบบ', keywords: 'ผู้ดูแล สิทธิ์ configuration' }] : []),
  ];

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
      for (const name of ['mock-auth-logged-in', 'mock-auth-role', 'mock-auth-name']) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      }
      window.dispatchEvent(new Event('ev-auth-change'));
      window.location.replace('/login');
    } finally {
      setIsSigningOut(false);
    }
  };

  const renderNavGroup = (label: string, items: NavItem[], collapsed: boolean, onNavigate?: () => void) => (
    <div className="space-y-1">
      {!collapsed && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>}
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
              <span className="block bg-gradient-to-r from-cyan-200 via-teal-100 to-amber-200 bg-clip-text text-[19px] font-black tracking-[-0.035em] text-transparent">LawiRisk-SSK</span>
              <span className="block truncate text-[9px] font-bold uppercase tracking-[0.2em] text-teal-400/90">Evidence Intelligence</span>
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

      <div className="border-t border-white/[0.06] p-3 space-y-2">
        <div className={`flex items-center rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.045] to-transparent p-2.5 shadow-[inset_0_1px_rgba(255,255,255,0.025)] ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-slate-800/80 text-slate-300"><CircleUserRound className="h-[18px] w-[18px]" /></span>
          {!collapsed && <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-100" suppressHydrationWarning>{userName}</span><span className="block truncate text-[11px] font-medium text-slate-400" suppressHydrationWarning>{roleLabel(userRole)}</span></span>}
        </div>
        <button type="button" onClick={handleLogout} disabled={isSigningOut} title={collapsed ? 'ออกจากระบบ' : undefined} className={`flex min-h-10 w-full items-center rounded-xl px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-400/[0.07] hover:text-rose-300 disabled:opacity-50 ${collapsed ? 'justify-center' : ''}`}>
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2.5 font-medium">{isSigningOut ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</span>}
        </button>
      </div>
    </>
    );
  };

  return (
    <div className="app-backdrop relative flex h-dvh min-h-[480px] overflow-hidden text-slate-100 sm:min-h-[640px]">
      <div className="spatial-field" aria-hidden="true"><span /><span /><span /></div>
      <a href="#main-content" className="sr-only z-[100] rounded-lg bg-teal-300 px-4 py-2 font-bold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">ข้ามไปยังเนื้อหาหลัก</a>
      <aside className={`nav-rail relative z-20 hidden shrink-0 flex-col border-r border-white/[0.055] transition-[width] duration-500 [transition-timing-function:var(--ease-out-expo)] lg:flex ${isCollapsed ? 'w-[80px]' : 'w-[280px]'}`}>
        {sidebarContent()}
        <button type="button" onClick={() => setIsCollapsed((value) => !value)} className="absolute -right-3.5 top-[98px] grid h-8 w-8 place-items-center rounded-full border border-white/[0.1] bg-[#0b1a29]/95 text-slate-400 shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all duration-300 hover:scale-110 hover:border-teal-300/20 hover:text-teal-300" aria-label={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}>
          <PanelLeftClose className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col" inert={isMobileMenuOpen ? true : undefined}>
        <header className="relative flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.055] bg-[#06111d]/55 px-3 shadow-[0_16px_50px_rgba(0,4,12,0.08)] backdrop-blur-2xl sm:h-20 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <button ref={mobileMenuButtonRef} type="button" disabled={!isHydrated} onClick={() => setIsMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 disabled:cursor-wait disabled:opacity-60 lg:hidden" aria-label="เปิดเมนูหลัก" aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-teal-300/80 sm:text-[10px] sm:tracking-[0.22em]">{meta.eyebrow}</p>
                <span className="hidden h-1 w-1 rounded-full bg-slate-500 sm:inline-block" />
                <span className="hidden items-center gap-1 font-mono text-[10px] text-slate-400 sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LEDGER: ONLINE
                </span>
              </div>
              <h2 className="mt-0.5 truncate text-[15px] font-bold tracking-[-0.015em] text-slate-100 sm:text-lg">{meta.title}</h2>
            </div>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-1.5 sm:gap-3">
            <SystemPulse open={activeHeaderPanel === 'system'} onOpenChange={(open) => setActiveHeaderPanel(open ? 'system' : null)} />
            <button type="button" onClick={() => { setActiveHeaderPanel(null); setIsCommandOpen(true); }} className="secondary-action hidden h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-slate-400 hover:text-teal-200 md:flex" aria-label="เปิดศูนย์คำสั่งลัด"><Search className="h-4 w-4 text-teal-300" /><span className="hidden xl:inline">ค้นหาคำสั่ง</span><kbd className="rounded-md border border-white/[0.07] bg-black/20 px-1.5 py-0.5 font-mono text-[9px] text-slate-600">Ctrl K</kbd></button>

            {/* Accessibility: Text Size Toggle Button */}
            <button
              type="button"
              onClick={toggleTextSize}
              title={textSize === 'large' ? 'ปรับขนาดตัวอักษรกลับเป็นมาตรฐาน' : 'ขยายขนาดตัวอักษรให้อ่านง่าย ชัดเจน (Large Text)'}
              aria-label="สลับขนาดตัวอักษร"
              className="secondary-action flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] p-0 text-xs font-bold text-slate-300 hover:text-teal-300 sm:w-auto sm:px-3"
            >
              <Type className="h-4 w-4 text-teal-400" />
              <span className="hidden sm:inline">{textSize === 'large' ? 'A+' : 'A'}</span>
            </button>

            {/* Theme Toggle: Dark / Light Mode */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)'}
              aria-label="สลับโหมดหน้าจอ สว่าง/มืด"
              className="secondary-action grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] text-slate-300 hover:text-amber-300"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-indigo-400" />}
            </button>

            {pathname !== '/satisfaction' && <StaffSatisfactionPrompt />}
            <NotificationCenter open={activeHeaderPanel === 'notifications'} onOpenChange={(open) => setActiveHeaderPanel(open ? 'notifications' : null)} storageScope={userRole} />
          </div>
        </header>

        <main id="main-content" className="relative flex-1 overflow-y-auto px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-9 lg:py-9 xl:px-11">
          <div className="workspace-telemetry mx-auto mb-4 flex w-full max-w-[1480px] items-center justify-between gap-2 overflow-hidden rounded-xl px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600 sm:mb-5 sm:justify-start sm:text-[9px] sm:tracking-[0.12em]">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-teal-300/65"><ShieldCheck className="h-3 w-3" /> SOURCE BOUND</span><span className="hidden h-1 w-1 rounded-full bg-slate-700 sm:inline-block" /><span className="hidden sm:inline">PRIVATE VAULT</span><span className="h-1 w-1 rounded-full bg-slate-700" /><span className="truncate">HUMAN REVIEW GATE</span><span className="ml-auto hidden text-indigo-300/50 sm:inline">OPERATIONS PLANE · {meta.eyebrow}</span>
          </div>
          <div key={pathname} className="route-stage page-enter mx-auto w-full max-w-[1480px] space-y-6 sm:space-y-8">{children}</div>
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" id="mobile-navigation">
          <button type="button" aria-label="ปิดเมนูหลัก" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <aside ref={mobileDialogRef} role="dialog" aria-modal="true" aria-label="เมนูหลัก" className="nav-rail absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col border-r border-white/[0.08] shadow-2xl animate-[drawer-enter_420ms_var(--ease-out-expo)]">
            <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="absolute right-4 top-5 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400" aria-label="ปิดเมนู"><X className="h-4 w-4" /></button>
            {sidebarContent(() => setIsMobileMenuOpen(false), true)}
          </aside>
        </div>
      )}
      <CommandPalette open={isCommandOpen} items={commandItems} onOpenChange={setIsCommandOpen} />
      <GuideAssistant />
    </div>
  );
}
