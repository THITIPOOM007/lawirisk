'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import SatisfactionSurvey from '@/components/SatisfactionSurvey';

export const STAFF_SATISFACTION_DELAY_MS = 120_000;

const startedAtKey = 'lawirisk-satisfaction-session-started-at';
const interactionKey = 'lawirisk-satisfaction-session-id';
const completedKey = 'lawirisk-satisfaction-session-completed';

export default function StaffSatisfactionPrompt() {
  const [interactionId, setInteractionId] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [completed, setCompleted] = useState(false);
  const surveyDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let inviteTimer: number | undefined;
    const bootstrapTimer = window.setTimeout(() => {
      if (sessionStorage.getItem(completedKey) === 'true') {
        setCompleted(true);
        return;
      }

      const now = Date.now();
      const storedStartedAt = Number(sessionStorage.getItem(startedAtKey) || now);
      const startedAt = Number.isFinite(storedStartedAt) ? storedStartedAt : now;
      sessionStorage.setItem(startedAtKey, String(startedAt));
      let storedInteractionId = sessionStorage.getItem(interactionKey);
      if (!storedInteractionId) {
        storedInteractionId = crypto.randomUUID();
        sessionStorage.setItem(interactionKey, storedInteractionId);
      }
      setInteractionId(storedInteractionId);

      const remaining = Math.max(0, STAFF_SATISFACTION_DELAY_MS - (now - startedAt));
      inviteTimer = window.setTimeout(() => setShowInvite(true), remaining);
    }, 0);
    return () => {
      window.clearTimeout(bootstrapTimer);
      if (inviteTimer !== undefined) window.clearTimeout(inviteTimer);
    };
  }, []);

  useEffect(() => {
    if (!showSurvey) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(surveyDialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []);
    const focusTimer = window.setTimeout(() => getFocusable()[0]?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSurvey(false);
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
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSurvey]);

  if (completed || !interactionId) return null;

  return (
    <>
      {showInvite && !showSurvey && (
        <button
          type="button"
          onClick={() => setShowSurvey(true)}
          className="group relative inline-flex h-10 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl border border-amber-300/25 bg-[linear-gradient(120deg,rgba(251,191,36,0.12),rgba(34,211,238,0.07))] px-3 text-xs font-black text-amber-100 shadow-[0_10px_30px_rgba(251,191,36,0.08)] transition hover:-translate-y-0.5 hover:border-amber-200/45 hover:shadow-[0_14px_38px_rgba(251,191,36,0.14)]"
          aria-label="เปิดแบบประเมินความพึงพอใจหลังใช้งาน 2 นาที"
          title="ใช้งานครบ 2 นาทีแล้ว · ประเมินเครื่องมือประมาณ 1 นาที"
        >
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" aria-hidden="true" />
          <Star className="h-4 w-4 fill-amber-300 text-amber-300 transition-transform group-hover:rotate-12 group-hover:scale-110" />
          <span className="hidden xl:inline">ประเมินเครื่องมือ</span>
        </button>
      )}

      {showSurvey && typeof document !== 'undefined' && createPortal((
        <div ref={surveyDialogRef} className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-label="แบบประเมินความพึงพอใจสำหรับเจ้าหน้าที่">
          <div className="mx-auto flex min-h-full max-w-2xl items-center py-4">
            <SatisfactionSurvey
              key={interactionId}
              audience="STAFF"
              context="STAFF_SESSION"
              interactionId={interactionId}
              onCancel={() => setShowSurvey(false)}
              onComplete={() => {
                sessionStorage.setItem(completedKey, 'true');
                setCompleted(true);
                setShowSurvey(false);
              }}
              className="w-full"
            />
          </div>
        </div>
      ), document.body)}
    </>
  );
}
