'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass-panel relative mx-auto max-w-xl overflow-hidden rounded-[30px] p-8 text-center sm:p-10" role="alert">
      <div className="absolute inset-x-16 -top-20 h-40 rounded-full bg-rose-300/[0.06] blur-3xl" aria-hidden="true" />
      <span className="floating-orb relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] text-rose-300 shadow-[0_0_36px_rgba(253,164,175,0.08)]"><AlertTriangle className="h-6 w-6" /></span>
      <h1 className="mt-6 text-2xl font-bold text-white">เปิดข้อมูลส่วนนี้ไม่สำเร็จ</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">ข้อมูลของคุณยังไม่ถูกเปลี่ยนแปลง ลองโหลดใหม่อีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ</p>
      <button type="button" onClick={reset} className="primary-action mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold"><RefreshCw className="h-4 w-4" /> ลองอีกครั้ง</button>
    </div>
  );
}
