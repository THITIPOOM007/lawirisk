'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Key, Database, AlertCircle, Loader2 } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Check if Supabase env credentials are set
    setIsDemoMode(!isSupabaseConfigured());
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    if (isDemoMode) {
      // In demo mode, simulate login as LEAD_INVESTIGATOR
      document.cookie = 'mock-auth-logged-in=true; path=/';
      document.cookie = 'mock-auth-role=LEAD_INVESTIGATOR; path=/';
      document.cookie = 'mock-auth-name=ร.ต.อ. สมชาย (Lead Investigator); path=/';
      
      setTimeout(() => {
        setIsLoading(false);
        router.push('/');
        router.refresh();
      }, 800);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage(error.message);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (role: 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'LEAD_INVESTIGATOR' | 'FIELD_OFFICER' | 'AUDITOR', name: string) => {
    setIsLoading(true);
    // Write cookies for middleware route guarding
    document.cookie = `mock-auth-logged-in=true; path=/`;
    document.cookie = `mock-auth-role=${role}; path=/`;
    document.cookie = `mock-auth-name=${encodeURIComponent(name)}; path=/`;

    setTimeout(() => {
      setIsLoading(false);
      router.push('/');
      router.refresh();
    }, 500);
  };

  return (
    <main className="flex-1 min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-900/20 rounded-full blur-[120px]" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center space-x-3">
          <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/30">
            <Shield className="h-8 w-8 text-white animate-pulse" />
          </div>
          <span className="text-3xl font-extrabold text-white tracking-wide">
            Evidence<span className="text-indigo-400">Verse</span> <span className="text-xs uppercase px-2 py-1 bg-slate-800 text-indigo-300 rounded border border-indigo-500/20 font-mono tracking-normal">Lite</span>
          </span>
        </div>
        <h2 className="mt-6 text-center text-xl font-medium text-slate-300">
          ระบบวิเคราะห์พยานหลักฐานดิจิทัลข้ามคดี
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10">
          {/* Connection Status Indicator */}
          <div className="mb-6 flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border border-slate-800/60 rounded-2xl text-xs">
            <div className="flex items-center space-x-2">
              <Database className={`h-4 w-4 ${isDemoMode ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className="text-slate-400">สถานะฐานข้อมูล:</span>
            </div>
            <span className={`font-semibold ${isDemoMode ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isDemoMode ? 'โหมดสาธิต (Demo Mode)' : 'เชื่อมต่อ Supabase แล้ว'}
            </span>
          </div>

          {errorMessage && (
            <div className="mb-6 bg-red-950/40 border border-red-900/50 p-4 rounded-2xl flex items-start space-x-3 text-red-300 text-sm">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                อีเมลผู้ใช้
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. user@evidenceverse.go.th"
                  className="block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm placeholder:text-slate-600 disabled:opacity-50 transition-all duration-250"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                รหัสผ่าน
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm placeholder:text-slate-600 disabled:opacity-50 transition-all duration-250"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-250 cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isDemoMode ? (
                  'เข้าสู่ระบบด้วยบัญชีชั่วคราว'
                ) : (
                  'ลงชื่อเข้าใช้งาน'
                )}
              </button>
            </div>
          </form>

          {/* Quick Demo Logins */}
          {isDemoMode && (
            <div className="mt-8 border-t border-slate-800/80 pt-6">
              <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                เลือกบทบาทจำลองเพื่อเข้าทดสอบ
              </span>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleDemoLogin('PLATFORM_ADMIN', 'พล.ต.ต. สุรศักดิ์ (Platform Admin)')}
                  disabled={isLoading}
                  className="flex items-center justify-center py-2.5 px-3 border border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-950/20 rounded-2xl text-xs font-medium text-slate-300 transition-all duration-200 cursor-pointer text-center"
                >
                  Platform Admin
                </button>
                <button
                  onClick={() => handleDemoLogin('ORG_ADMIN', 'พ.ต.อ. ประสิทธิ์ (Org Admin)')}
                  disabled={isLoading}
                  className="flex items-center justify-center py-2.5 px-3 border border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-950/20 rounded-2xl text-xs font-medium text-slate-300 transition-all duration-200 cursor-pointer text-center"
                >
                  Org Admin
                </button>
                <button
                  onClick={() => handleDemoLogin('LEAD_INVESTIGATOR', 'ร.ต.อ. สมชาย (Lead Investigator)')}
                  disabled={isLoading}
                  className="flex items-center justify-center py-2.5 px-3 border border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-950/20 rounded-2xl text-xs font-medium text-slate-300 transition-all duration-200 cursor-pointer text-center"
                >
                  Lead Investigator
                </button>
                <button
                  onClick={() => handleDemoLogin('FIELD_OFFICER', 'ร.ต.ท. เกรียงไกร (Field Officer)')}
                  disabled={isLoading}
                  className="flex items-center justify-center py-2.5 px-3 border border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-950/20 rounded-2xl text-xs font-medium text-slate-300 transition-all duration-200 cursor-pointer text-center"
                >
                  Field Officer
                </button>
                <button
                  onClick={() => handleDemoLogin('AUDITOR', 'นางสาวจิราภรณ์ (Auditor)')}
                  disabled={isLoading}
                  className="col-span-2 flex items-center justify-center py-2.5 px-3 border border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-950/20 rounded-2xl text-xs font-medium text-slate-300 transition-all duration-200 cursor-pointer text-center"
                >
                  Auditor (ตรวจสอบระบบ)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
