'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass-panel mx-auto max-w-xl rounded-[28px] p-8 text-center sm:p-10" role="alert">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] text-rose-300"><AlertTriangle className="h-6 w-6" /></span>
      <h1 className="mt-6 text-2xl font-bold text-white">เปิดข้อมูลส่วนนี้ไม่สำเร็จ</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">ข้อมูลของคุณยังไม่ถูกเปลี่ยนแปลง ลองโหลดใหม่อีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ</p>
      <button type="button" onClick={reset} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-300 px-5 text-sm font-bold text-[#05201d] transition hover:bg-teal-200"><RefreshCw className="h-4 w-4" /> ลองอีกครั้ง</button>
    </div>
  );
}
