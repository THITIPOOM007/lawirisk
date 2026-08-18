'use client';

import { useEffect, useState } from 'react';
import { Database, Loader2, Save, Settings, ShieldAlert, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import type { StaffRole } from '@/lib/roles';
import { roleLabel } from '@/lib/roles';

type UserRecord = { id: string; email: string; name: string; role: StaffRole; created_at: string };

export default function AdminSettingsPage() {
  const [threshold, setThreshold] = useState(0.75);
  const [autoExtract, setAutoExtract] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/admin/settings', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดการตั้งค่าไม่สำเร็จ');
        setThreshold(body.data.settings.confidenceThreshold);
        setAutoExtract(body.data.settings.autoExtraction);
        setUsers(body.data.users as UserRecord[]);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'โหลดการตั้งค่าไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/v1/admin/settings', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confidenceThreshold: threshold, autoExtraction: autoExtract }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
      setSuccess('บันทึกค่าระบบและ Audit log แล้ว');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <header><h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-white"><Settings className="h-8 w-8 text-indigo-500" />การตั้งค่าระบบ</h1><p className="mt-2 text-slate-400">ค่าที่แสดงในหน้านี้อ่านและบันทึกผ่านฐานข้อมูลจริง รายการที่ยังไม่มี persistence จะไม่แสดงเป็นตัวควบคุม</p></header>
      {error && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">{success}</div>}
      {isLoading ? <div className="flex min-h-64 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลด...</div> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <form onSubmit={save} className="space-y-7 rounded-3xl border border-slate-900 bg-slate-900/30 p-6">
            <h2 className="flex items-center text-lg font-bold text-white"><Database className="mr-2 h-5 w-5 text-indigo-400" />ข้อกำหนดงานวิเคราะห์</h2>
            <div><label htmlFor="confidence" className="text-sm font-semibold text-slate-300">เกณฑ์ความเชื่อมั่นที่แสดงต่อผู้ตรวจทาน</label><p className="mt-1 text-xs text-slate-500">ค่านี้เป็นตัวกรองข้อเสนอ ไม่ใช่สิทธิ์ยืนยันข้อเท็จจริงอัตโนมัติ</p><div className="mt-4 flex items-center gap-4"><input id="confidence" type="range" min="0" max="1" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="flex-1 accent-indigo-500" /><output className="w-14 text-right font-mono text-sm font-bold text-indigo-300">{Math.round(threshold * 100)}%</output></div></div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-900 bg-slate-950/50 p-4"><div><p className="text-sm font-semibold text-slate-300">สร้างงาน extraction อัตโนมัติ</p><p className="mt-1 text-xs text-slate-500">ผลลัพธ์ยังคงเป็น SUGGESTED และต้องตรวจโดยมนุษย์</p></div><button type="button" onClick={() => setAutoExtract((value) => !value)} aria-pressed={autoExtract} aria-label="สลับการสร้างงาน extraction อัตโนมัติ">{autoExtract ? <ToggleRight className="h-10 w-10 text-indigo-500" /> : <ToggleLeft className="h-10 w-10 text-slate-600" />}</button></div>
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-6 text-amber-100"><ShieldAlert className="mt-1 h-4 w-4 shrink-0" />การเปิดค่านี้จะมีผลเมื่อ worker/provider สำหรับ OCR และ extraction ถูกตั้งค่าและผ่าน health check เท่านั้น</div>
            <div className="flex justify-end border-t border-slate-900 pt-5"><button disabled={isSaving} className="inline-flex items-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}บันทึก</button></div>
          </form>
          <section className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6"><h2 className="flex items-center text-lg font-bold text-white"><Users className="mr-2 h-5 w-5 text-indigo-400" />เจ้าหน้าที่ที่เข้าถึงได้ ({users.length})</h2><div className="mt-5 space-y-3">{users.map((user) => <div key={user.id} className="rounded-2xl border border-slate-900 bg-slate-950/50 p-4"><p className="text-sm font-semibold text-white">{user.name}</p><p className="mt-1 break-all text-xs text-slate-500">{user.email}</p><span className="mt-3 inline-flex rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-300">{roleLabel(user.role)}</span></div>)}</div></section>
        </div>
      )}
    </div>
  );
}
