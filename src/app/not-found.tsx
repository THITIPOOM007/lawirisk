import Link from 'next/link';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="glass-panel mx-auto max-w-xl rounded-[28px] p-8 text-center sm:p-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-slate-400"><FileQuestion className="h-6 w-6" /></span>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300/70">404 · Not found</p>
      <h1 className="mt-2 text-2xl font-bold text-white">ไม่พบรายการที่ต้องการ</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">รายการอาจถูกย้าย หรือคุณอาจไม่มีสิทธิ์เข้าถึงจากพื้นที่ทำงานนี้</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"><ArrowLeft className="h-4 w-4" /> กลับหน้าภาพรวม</Link>
    </div>
  );
}
