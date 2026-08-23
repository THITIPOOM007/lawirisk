'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Fingerprint, KeyRound, Loader2, Plus, ScanFace, ShieldCheck, Trash2 } from 'lucide-react';
import { isBiometricAvailable, registerPasskey } from '@/lib/webauthn-client';

type Credential = {
  id: string;
  nickname: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
  mode?: 'demo';
};

export default function SecurityPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/passkey/credentials', { credentials: 'same-origin' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.error?.message || 'โหลดรายการ Passkey ไม่สำเร็จ');
      setCredentials(body.data);
    } catch (caught: unknown) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'โหลดรายการ Passkey ไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadCredentials());
    void isBiometricAvailable().then((result) => setAvailable(result));
  }, [loadCredentials]);

  const addPasskey = async () => {
    setWorking(true);
    setMessage(null);
    const nickname = `Passkey · ${navigator.platform || 'อุปกรณ์ปัจจุบัน'}`;
    const result = await registerPasskey(nickname);
    if (result.success) {
      setMessage({ tone: 'success', text: 'ลงทะเบียน Passkey สำเร็จ ระบบเก็บเฉพาะกุญแจสาธารณะ ไม่เก็บภาพใบหน้า' });
      await loadCredentials();
    } else {
      setMessage({ tone: 'error', text: result.error || 'ลงทะเบียน Passkey ไม่สำเร็จ' });
    }
    setWorking(false);
  };

  const removePasskey = async (credential: Credential) => {
    if (!window.confirm(`ยืนยันลบ “${credential.nickname}” ออกจากบัญชีนี้`)) return;
    setWorking(true);
    setMessage(null);
    const response = await fetch('/api/v1/auth/passkey/credentials', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: credential.id }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage({ tone: 'error', text: body?.error?.message || 'ลบ Passkey ไม่สำเร็จ' });
    else {
      setCredentials((items) => items.filter((item) => item.id !== credential.id));
      setMessage({ tone: 'success', text: 'นำอุปกรณ์ Passkey ออกจากบัญชีแล้ว และบันทึก Audit Log เรียบร้อย' });
    }
    setWorking(false);
  };

  return (
    <div className="space-y-6">
      <section className="glass-panel overflow-hidden rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Passwordless & Biometric Security</p>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">สแกนใบหน้า / ลายนิ้วมือด้วย Passkey</h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">ระบบเรียก Windows Hello, Face ID, Touch ID หรือ Security Key ของอุปกรณ์โดยตรง ข้อมูลชีวมิติไม่ออกจากอุปกรณ์และ LAWiRISK ไม่บันทึกภาพใบหน้า</p>
          </div>
          <button type="button" onClick={() => void addPasskey()} disabled={working || available === false} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-300 px-5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}เพิ่ม Passkey
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><ScanFace className="h-5 w-5 text-teal-300" /><p className="mt-3 text-sm font-semibold text-white">Platform biometric</p><p className="mt-1 text-xs leading-5 text-slate-500">{available === null ? 'กำลังตรวจสอบอุปกรณ์…' : available ? 'อุปกรณ์นี้พร้อมสแกนชีวมิติ' : 'ไม่พบตัวสแกนบนอุปกรณ์นี้'}</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><KeyRound className="h-5 w-5 text-amber-300" /><p className="mt-3 text-sm font-semibold text-white">FIDO2 cryptography</p><p className="mt-1 text-xs leading-5 text-slate-500">ยืนยันด้วย challenge และลายเซ็นดิจิทัลทุกครั้ง</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><ShieldCheck className="h-5 w-5 text-sky-300" /><p className="mt-3 text-sm font-semibold text-white">Zero biometric retention</p><p className="mt-1 text-xs leading-5 text-slate-500">เก็บเฉพาะ public key, counter และชื่ออุปกรณ์</p></div>
        </div>

        {message && <div role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-5 flex items-start gap-2 rounded-xl border p-4 text-sm ${message.tone === 'success' ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100' : 'border-rose-300/20 bg-rose-300/[0.05] text-rose-100'}`}>{message.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}{message.text}</div>}
      </section>

      <section className="glass-panel rounded-[24px] p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">อุปกรณ์ที่ลงทะเบียน</h2><p className="mt-1 text-xs text-slate-500">ตรวจสอบและเพิกถอน Passkey ที่ไม่ใช้งานแล้ว</p></div><Fingerprint className="h-6 w-6 text-teal-300" /></div>
        <div className="mt-5 space-y-3">
          {loading ? <div className="h-24 animate-pulse rounded-2xl bg-white/[0.035]" /> : credentials.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.1] p-8 text-center text-sm text-slate-500">ยังไม่มี Passkey — เพิ่มอุปกรณ์แรกเพื่อใช้สแกนเข้าระบบ</div> : credentials.map((credential) => (
            <article key={credential.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-300/[0.08] text-teal-300"><Fingerprint className="h-5 w-5" /></span><div><h3 className="text-sm font-semibold text-white">{credential.nickname}</h3><p className="mt-1 text-[10px] text-slate-500">เพิ่มเมื่อ {new Date(credential.createdAt).toLocaleString('th-TH')} · {credential.backedUp ? 'สำรองข้ามอุปกรณ์ได้' : 'ผูกกับอุปกรณ์'}</p>{credential.lastUsedAt && <p className="mt-0.5 text-[10px] text-slate-600">ใช้ล่าสุด {new Date(credential.lastUsedAt).toLocaleString('th-TH')}</p>}</div></div>
              <button type="button" disabled={working} onClick={() => void removePasskey(credential)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-300/15 px-3 text-xs text-rose-200 hover:bg-rose-300/[0.06] disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />นำออก</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
