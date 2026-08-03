'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield,
  Search,
  Briefcase,
  FileText,
  Eye,
  Database,
  Link2,
  FileBarChart,
  History,
  Settings,
  LogOut,
  User,
  Menu,
  X,
  Inbox
} from 'lucide-react';

interface NavigationProps {
  children: React.ReactNode;
}

export default function Navigation({ children }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('เจ้าหน้าที่');
  const [userRole, setUserRole] = useState('VIEWER');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Read mock-auth cookies
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };

    const mockName = getCookie('mock-auth-name');
    const mockRole = getCookie('mock-auth-role');

    if (mockName) setUserName(decodeURIComponent(mockName));
    if (mockRole) setUserRole(mockRole);
  }, [pathname]);

  const handleLogout = () => {
    // Clear cookies
    document.cookie = 'mock-auth-logged-in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'mock-auth-role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'mock-auth-name=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { name: 'ศูนย์บัญชาการ', href: '/', icon: Search },
    { name: 'คัดกรองคำร้อง', href: '/intake', icon: Inbox },
    { name: 'คดีทั้งหมด', href: '/cases', icon: Briefcase },
    { name: 'ทะเบียนหลักฐาน', href: '/evidence', icon: FileText },
    { name: 'AI Review', href: '/review', icon: Eye },
    { name: 'ทะเบียนข้อมูล', href: '/entities', icon: Database },
    { name: 'วิเคราะห์ความเชื่อมโยง', href: '/matches', icon: Link2 },
    { name: 'รายงานสรุป', href: '/reports', icon: FileBarChart },
    { name: 'Audit Logs', href: '/audit', icon: History },
  ];

  // Show Admin Settings option if role has administrative privileges
  if (['ADMIN', 'PLATFORM_ADMIN', 'ORG_ADMIN'].includes(userRole)) {
    navItems.push({ name: 'จัดการระบบ', href: '/admin/settings', icon: Settings });
  }

  // Helper to check if item is active
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'PLATFORM_ADMIN':
      case 'ADMIN': 
        return 'bg-red-500/10 text-red-400 border-red-500/25';
      case 'ORG_ADMIN':
      case 'LEAD_INVESTIGATOR':
      case 'INVESTIGATOR': 
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25';
      case 'LEGAL_REVIEWER':
      case 'REVIEWER': 
        return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      default: 
        return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'PLATFORM_ADMIN': return 'Platform Admin';
      case 'ORG_ADMIN': return 'Org Admin';
      case 'AUDITOR': return 'Auditor';
      case 'LEAD_INVESTIGATOR': return 'Lead Investigator';
      case 'INVESTIGATOR': return 'Investigator';
      case 'LEGAL_REVIEWER': return 'Legal Reviewer';
      case 'FIELD_OFFICER': return 'Field Officer';
      case 'ADMIN': return 'ผู้ดูแลระบบ';
      case 'REVIEWER': return 'ผู้ตรวจทาน';
      default: return 'ผู้สังเกตการณ์';
    }
  };

  // If we are on the login page, do not render navigation
  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col shrink-0 border-r border-slate-900 bg-slate-950">
        <div className="flex h-16 items-center px-6 border-b border-slate-900">
          <Link href="/" className="flex items-center space-x-2.5">
            <Shield className="h-6 w-6 text-indigo-500" />
            <span className="text-xl font-bold text-white tracking-wide">
              Evidence<span className="text-indigo-400">Verse</span>
            </span>
          </Link>
        </div>

        {/* User Info Card */}
        <div className="p-4 border-b border-slate-900 bg-slate-900/10">
          <div className="flex items-center space-x-3 p-2 bg-slate-900/30 border border-slate-800/40 rounded-2xl">
            <div className="h-9 w-9 rounded-xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
              <User className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-medium border rounded-md ${getRoleBadgeColor(userRole)}`}>
                {getRoleLabel(userRole)}
              </span>
            </div>
          </div>
        </div>

        {/* Main Navigation Links */}
        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
              >
                <Icon className={`h-5 w-5 mr-3 ${active ? 'text-white' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-4 border-t border-slate-900">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-red-950/20 hover:border-red-900/35 border border-transparent rounded-2xl transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-5 w-5 mr-3 text-slate-400 hover:text-red-400" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex md:hidden h-16 items-center justify-between px-6 bg-slate-950 border-b border-slate-900">
          <Link href="/" className="flex items-center space-x-2.5">
            <Shield className="h-6 w-6 text-indigo-500" />
            <span className="text-lg font-bold text-white">
              Evidence<span className="text-indigo-400">Verse</span>
            </span>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1 text-slate-400 hover:text-white focus:outline-none cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Menu Panel */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md pt-16">
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3.5 rounded-2xl text-base font-medium ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="h-6 w-6 mr-4" />
                    {item.name}
                  </Link>
                );
              })}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center px-4 py-3.5 text-base font-medium text-red-400 hover:bg-red-950/20 rounded-2xl cursor-pointer"
              >
                <LogOut className="h-6 w-6 mr-4" />
                ออกจากระบบ
              </button>
            </nav>
          </div>
        )}

        {/* Content Children wrapper */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-8 lg:p-10 relative">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
