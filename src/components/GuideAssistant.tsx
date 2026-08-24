'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  FileSearch,
  Menu,
  Route,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

const TOUR_STORAGE_KEY = 'lawirisk-guide-tour-seen-v1';

const tourSteps = [
  {
    icon: Sparkles,
    eyebrow: 'ยินดีต้อนรับ',
    title: 'เริ่มใช้ LawiRisk-SSK อย่างเป็นระบบ',
    description: 'ทัวร์ฉบับย่อนี้ช่วยให้เห็นภาพการทำงานตั้งแต่รับเรื่อง ไปจนถึงออกรายงานที่ตรวจสอบย้อนกลับได้ ใช้เวลาประมาณ 2 นาที',
    tip: 'คุณสามารถกด “ข้ามทัวร์” หรือปิดหน้าต่างนี้ได้ทุกเมื่อ',
  },
  {
    icon: Menu,
    eyebrow: 'โครงสร้างหน้าจอ',
    title: 'เมนูซ้ายคือศูนย์รวมทุกงาน',
    description: 'บนเดสก์ท็อปใช้เมนูด้านซ้าย ส่วนมือถือและแท็บเล็ตแตะปุ่มเมนูมุมซ้ายบน แต่ละกลุ่มแยกงานปฏิบัติการ งานวิเคราะห์ และงานกำกับดูแล',
    tip: 'เมนูที่กำลังใช้งานจะมีแถบสีเขียวฟ้าและสถานะ active ชัดเจน',
  },
  {
    icon: Route,
    eyebrow: 'เส้นทางหลัก',
    title: 'รับเรื่อง → เปิดคดี → เก็บหลักฐาน',
    description: 'เริ่มที่รายการรับเรื่องและคัดกรอง สร้างสำนวนคดี แล้วอัปโหลดหลักฐานต้นฉบับ ระบบจะเก็บค่าแฮชและแหล่งที่มาเพื่อรักษาสายการควบคุม',
    tip: 'กรอกข้อมูลที่มาของหลักฐานให้ครบก่อนส่งเข้าสู่การวิเคราะห์ทุกครั้ง',
  },
  {
    icon: FileSearch,
    eyebrow: 'Human in the loop',
    title: 'ผลจากระบบต้องผ่านการตรวจทาน',
    description: 'ผล OCR การจับคู่ และข้อเสนอแนะจากระบบเป็นเพียงข้อมูลช่วยตัดสินใจ เจ้าหน้าที่ต้องเปิดหลักฐานต้นฉบับ ตรวจตำแหน่งอ้างอิง และลงนามรับรอง',
    tip: 'อย่านำสถานะ SUGGESTED ไปใช้เป็นข้อสรุปจนกว่าจะได้รับการยืนยัน',
  },
  {
    icon: ShieldCheck,
    eyebrow: 'พร้อมเริ่มงาน',
    title: 'ทุกการกระทำสำคัญตรวจสอบย้อนหลังได้',
    description: 'เมื่อพร้อม คุณสามารถเปิดศูนย์คู่มือเพื่อค้นหาวิธีใช้รายฟีเจอร์ ดูขั้นตอนแบบละเอียด และกดไปยังหน้าที่ต้องการได้ทันที',
    tip: 'กลับมาเปิดทัวร์นี้ได้เสมอจากปุ่ม “คู่มือ” มุมล่างขวา',
  },
] as const;

export default function GuideAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [showNudge, setShowNudge] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const rememberTour = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // The tour remains usable when storage is unavailable.
    }
    setShowNudge(false);
  }, []);

  const closeTour = useCallback(() => {
    rememberTour();
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [rememberTour]);

  const openTour = useCallback(() => {
    setStep(0);
    setShowNudge(false);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setShowNudge(window.localStorage.getItem(TOUR_STORAGE_KEY) !== 'true');
      } catch {
        setShowNudge(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) || []);
    getFocusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTour();
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
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeTour, isOpen]);

  const currentStep = tourSteps[step];
  const StepIcon = currentStep.icon;

  return (
    <>
      <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex max-w-[calc(100vw-2rem)] items-end gap-3 sm:bottom-6 sm:right-6">
        {showNudge && !isOpen && (
          <div className="guide-nudge pointer-events-auto relative hidden w-64 rounded-2xl border border-teal-300/20 bg-[#071521]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:block" role="status">
            <button type="button" onClick={rememberTour} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-slate-200" aria-label="ปิดคำแนะนำ"><X className="h-3.5 w-3.5" /></button>
            <div className="flex items-start gap-3 pr-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-teal-300/20 bg-teal-300/10 text-teal-200"><Sparkles className="h-4 w-4" /></span>
              <div>
                <p className="text-xs font-bold text-white">เพิ่งเริ่มใช้งานใช่ไหม?</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">เปิดทัวร์ 2 นาที หรือดูคู่มือฉบับเต็มได้ทันที</p>
              </div>
            </div>
          </div>
        )}

        <button
          ref={triggerRef}
          type="button"
          onClick={openTour}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="guide-fab pointer-events-auto group inline-flex min-h-12 items-center gap-2 rounded-2xl border border-teal-200/30 bg-gradient-to-br from-teal-200 to-cyan-400 px-3.5 text-sm font-black text-[#03201b] shadow-[0_16px_50px_rgba(45,212,191,0.34)] transition hover:-translate-y-1 hover:shadow-[0_20px_65px_rgba(45,212,191,0.44)] sm:min-h-14 sm:px-4"
          aria-label="เปิดทัวร์แนะนำการใช้งาน"
        >
          <BookOpenText className="h-5 w-5" />
          <span className="hidden sm:inline">คู่มือ</span>
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#020812]/72 p-0 backdrop-blur-md sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeTour(); }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-tour-title"
            className="guide-tour-panel relative flex max-h-[min(92dvh,680px)] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/[0.1] bg-[#071521]/98 shadow-[0_-20px_90px_rgba(0,0,0,0.5)] sm:max-w-xl sm:rounded-[30px] sm:shadow-[0_30px_100px_rgba(0,0,0,0.58)]"
          >
            <div className="relative overflow-hidden border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
              <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-teal-300/10 blur-3xl" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-teal-300/25 bg-teal-300/10 text-teal-200 shadow-[0_0_28px_rgba(45,212,191,0.12)]"><StepIcon className="h-5 w-5" /></span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">Quick tour · {step + 1}/{tourSteps.length}</p>
                    <p className="mt-1 text-xs text-slate-500">เรียนรู้ตามลำดับงานจริง</p>
                  </div>
                </div>
                <button type="button" onClick={closeTour} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-400 hover:text-white" aria-label="ปิดทัวร์"><X className="h-4 w-4" /></button>
              </div>
              <div className="relative mt-5 grid grid-cols-5 gap-2" aria-label={`ขั้นตอนที่ ${step + 1} จาก ${tourSteps.length}`}>
                {tourSteps.map((item, index) => (
                  <span key={item.title} className={`h-1 rounded-full transition-colors ${index <= step ? 'bg-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.35)]' : 'bg-white/[0.08]'}`} />
                ))}
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-7 sm:px-7 sm:py-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/80">{currentStep.eyebrow}</p>
              <h2 id="guide-tour-title" className="mt-2 text-balance text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">{currentStep.title}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{currentStep.description}</p>
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.055] p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <p className="text-xs leading-6 text-slate-400"><span className="font-bold text-sky-200">เคล็ดลับ: </span>{currentStep.tip}</p>
              </div>
            </div>

            <div className="mt-auto flex flex-col items-stretch justify-between gap-2 border-t border-white/[0.07] bg-black/10 px-5 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-7 sm:py-4">
              <button type="button" onClick={closeTour} className="min-h-10 self-start rounded-xl px-2 text-xs font-semibold text-slate-500 hover:text-slate-200 sm:min-h-11">ข้ามทัวร์</button>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="secondary-action inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.09] px-4 text-xs font-bold text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"><ArrowLeft className="h-4 w-4" />ก่อนหน้า</button>
                {step < tourSteps.length - 1 ? (
                  <button type="button" onClick={() => setStep((value) => Math.min(tourSteps.length - 1, value + 1))} className="primary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-xs font-black">ถัดไป<ArrowRight className="h-4 w-4" /></button>
                ) : (
                  <Link href="/guide" onClick={closeTour} className="primary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-xs font-black">เปิดคู่มือฉบับเต็ม<ArrowRight className="h-4 w-4" /></Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
