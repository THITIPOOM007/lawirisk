'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Fingerprint, Lock, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { verifyBiometricPasskey } from '@/lib/webauthn-client';

interface BiometricStepUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  reason: string;
  actionLabel?: string;
}

export function BiometricStepUpModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'ยืนยันตัวตนด้วยชีวมิติ (Biometric Step-Up)',
  reason,
  actionLabel = 'สแกนใบหน้า / ลายนิ้วมือเพื่อปลดล็อก',
}: BiometricStepUpModalProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const verifyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => verifyButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isVerifying) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isVerifying, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleVerify = async () => {
    setIsVerifying(true);
    setErrorText('');
    setStatusText('กำลังเรียก Windows Hello / Touch ID บนอุปกรณ์ของคุณ...');

    try {
      const result = await verifyBiometricPasskey(reason);
      if (result.success) {
        setStatusText('ยืนยันตัวตนสำเร็จ! กำลังปลดล็อกข้อมูล...');
        setTimeout(() => {
          setIsVerifying(false);
          onSuccess();
          onClose();
        }, 600);
      } else {
        throw new Error(result.error || 'การยืนยันตัวตนไม่สำเร็จ');
      }
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสแกน');
      setIsVerifying(false);
      setStatusText('');
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-[max(1rem,4vh)] backdrop-blur-md animate-[drawer-enter_250ms_var(--ease-out-expo)]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isVerifying) onClose(); }}>
      <div className="hud-panel relative w-full max-w-md space-y-6 rounded-3xl border border-teal-300/30 p-6 text-center shadow-[0_0_50px_rgba(66,232,206,0.15)] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="biometric-step-up-title" data-testid="biometric-step-up-dialog">
        
        {/* Top Icon with Pulse Rings */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-teal-400/40 animate-ping opacity-30" />
          <div className="absolute -inset-2 rounded-full border border-teal-300/20" />
          <div className="relative w-16 h-16 rounded-2xl bg-teal-950/60 border border-teal-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.3)]">
            <Fingerprint className="w-8 h-8 text-teal-300 animate-pulse" />
          </div>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-300/30 bg-teal-400/10 px-3 py-1 text-[10px] font-bold text-teal-200 uppercase tracking-widest">
            <Lock className="h-3 w-3 text-teal-300" />
            <span>NIST SP 800-63B · On-Device Biometric</span>
          </div>
          <h2 id="biometric-step-up-title" className="text-xl font-black text-white tracking-tight">
            {title}
          </h2>
          <p className="text-xs leading-relaxed text-slate-400">
            {reason}
          </p>
        </div>

        {/* Hardware & Privacy Notice */}
        <div className="rounded-2xl border border-white/[0.08] bg-slate-950/60 p-3.5 text-left text-[11px] leading-relaxed text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-teal-300">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>มาตรการคุ้มครองข้อมูลส่วนบุคคล (PDPA Compliant)</span>
          </div>
          <p className="text-slate-400">
            ภาพใบหน้าหรือลายนิ้วมือจะถูกประมวลผลภายในอุปกรณ์ของคุณเท่านั้น (Zero Biometric Server Retention)
          </p>
        </div>

        {errorText && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300 text-left">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorText}</span>
          </div>
        )}

        {statusText && (
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-teal-300 animate-pulse">
            <Sparkles className="h-4 w-4 text-teal-300" />
            <span>{statusText}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            ref={verifyButtonRef}
            type="button"
            disabled={isVerifying}
            onClick={handleVerify}
            className="primary-action w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(66,232,206,0.25)] cursor-pointer disabled:opacity-50"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังตรวจสอบชีวมิติ...
              </>
            ) : (
              <>
                <Fingerprint className="h-4 w-4" />
                {actionLabel}
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isVerifying}
            onClick={onClose}
            className="w-full py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
