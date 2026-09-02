'use client';

import { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Compass, Gauge, HeartHandshake, Loader2, MessageSquareText, Send, ShieldCheck, Star } from 'lucide-react';
import type { SatisfactionAudience, SatisfactionContext } from '@/lib/satisfaction-contract';

type RatingKey = 'convenience' | 'speed' | 'accuracy' | 'overall';

type SatisfactionSurveyProps = {
  audience: SatisfactionAudience;
  context: SatisfactionContext;
  interactionId: string;
  onComplete?: () => void;
  onCancel?: () => void;
  className?: string;
};

const questions = [
  {
    key: 'convenience' as const,
    title: 'ความสะดวกในการใช้งาน',
    prompt: 'คุณคิดว่าขั้นตอน เมนู และการเข้าถึงข้อมูลสำคัญใช้งานได้สะดวกเพียงใด?',
    description: 'โปรดพิจารณาจากความชัดเจนของเมนู จำนวนขั้นตอน และความง่ายในการค้นหาฟังก์ชันที่ต้องการ โดยไม่ต้องประเมินความเร็วในข้อนี้',
    icon: Compass,
  },
  {
    key: 'speed' as const,
    title: 'ความรวดเร็วและการเข้าถึงข้อมูล',
    prompt: 'คุณคิดว่าระบบตอบสนองรวดเร็ว และช่วยให้เข้าถึงข้อมูลที่ต้องการได้เร็วแค่ไหน?',
    description: 'โปรดนึกถึงเวลาตั้งแต่เริ่มค้นหา เปิดรายการ หรือทำรายการ จนเห็นข้อมูลพร้อมใช้งาน รวมถึงความต่อเนื่องระหว่างแต่ละหน้าจอ',
    icon: Gauge,
  },
  {
    key: 'accuracy' as const,
    title: 'ความถูกต้องและตรงความต้องการ',
    prompt: 'ข้อมูลหรือผลลัพธ์ที่ระบบแสดง ตรงกับสิ่งที่คุณต้องการและนำไปใช้งานต่อได้เพียงใด?',
    description: 'โปรดพิจารณาความถูกต้อง ความครบถ้วน และความสามารถในการตรวจสอบย้อนกลับถึงข้อมูลต้นทาง โดยผลจาก AI ยังต้องผ่านการตรวจทานจากเจ้าหน้าที่',
    icon: ShieldCheck,
  },
  {
    key: 'overall' as const,
    title: 'ความพึงพอใจโดยรวม',
    prompt: 'เมื่อพิจารณาประสบการณ์ทั้งหมด คุณพึงพอใจกับระบบ LawiRisk-SSK ในระดับใด?',
    description: 'โปรดให้คะแนนจากภาพรวมของความสะดวก ความรวดเร็ว ความถูกต้อง และประโยชน์ที่ได้รับจากการใช้งานครั้งนี้',
    icon: HeartHandshake,
  },
];

const scoreLabels = ['ควรปรับปรุงมาก', 'ควรปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก'];

export default function SatisfactionSurvey({ audience, context, interactionId, onComplete, onCancel, className = '' }: SatisfactionSurveyProps) {
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, number>>>({});
  const [suggestion, setSuggestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const totalSteps = questions.length + 1;
  const progress = Math.round(((step + 1) / totalSteps) * 100);
  const currentQuestion = questions[step];
  const CurrentQuestionIcon = currentQuestion?.icon;
  const selectedScore = currentQuestion ? ratings[currentQuestion.key] : undefined;
  const overallScore = ratings.overall || 0;
  const completedRatings = useMemo(() => questions.filter((question) => ratings[question.key]).length, [ratings]);

  const submit = async () => {
    if (completedRatings !== questions.length || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/v1/satisfaction', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          context,
          interactionId,
          convenience: ratings.convenience,
          speed: ratings.speed,
          accuracy: ratings.accuracy,
          overall: ratings.overall,
          suggestion: suggestion.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกแบบประเมินไม่สำเร็จ');
      setIsComplete(true);
      onComplete?.();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'บันทึกแบบประเมินไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isComplete) {
    return (
      <section className={`rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.08] p-6 text-center ${className}`} aria-live="polite">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-300">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-black text-white">ขอบคุณสำหรับคะแนนและข้อเสนอแนะ</h2>
        <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-slate-300">คำตอบถูกบันทึกแบบไม่เปิดเผยข้อมูลส่วนบุคคล และจะนำไปใช้ปรับปรุง LAWiRISK ให้ใช้งานได้ดียิ่งขึ้น</p>
      </section>
    );
  }

  return (
    <section className={`overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#071522]/95 shadow-[0_24px_80px_rgba(0,0,0,0.32)] ${className}`} aria-labelledby={`satisfaction-title-${interactionId}`}>
      <div className="border-b border-white/[0.07] bg-gradient-to-r from-cyan-300/[0.08] via-teal-300/[0.04] to-transparent p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">R2R feedback · 1 minute</p>
            <h2 id={`satisfaction-title-${interactionId}`} className="mt-1 text-lg font-black text-white">แบบประเมินเพื่อพัฒนางานประจำ</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">ให้คะแนน 4 ด้านจากประสบการณ์ครั้งนี้ คำตอบจะสรุปเป็นผลวิจัยเพื่อปรับปรุงระบบรอบถัดไป</p>
          </div>
          <span className="rounded-full border border-teal-300/20 bg-teal-300/[0.08] px-3 py-1 font-mono text-[10px] font-bold text-teal-200">
            {completedRatings}/4 คะแนน
          </span>
        </div>

        <div className="mt-5" aria-label={`ความคืบหน้า ${progress}%`}>
          <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-slate-400">
            <span>ขั้นตอนที่ {step + 1} จาก {totalSteps}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-950" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-300 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-3 grid grid-cols-5 gap-2" aria-label="ขั้นตอนแบบประเมิน">
            {Array.from({ length: totalSteps }, (_, index) => (
              <li key={index} className={`flex items-center gap-1 text-[9px] ${index < step ? 'text-emerald-300' : index === step ? 'text-cyan-200' : 'text-slate-600'}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${index < step ? 'border-emerald-300/40 bg-emerald-300/10' : index === step ? 'border-cyan-300/50 bg-cyan-300/10' : 'border-white/[0.08]'}`}>
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {currentQuestion ? (
          <fieldset aria-describedby={`satisfaction-guidance-${interactionId}-${currentQuestion.key}`}>
            <legend className="w-full">
              <span className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
                  {CurrentQuestionIcon && <CurrentQuestionIcon className="h-5 w-5" />}
                </span>
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300/70">คำถามที่ {step + 1} · {currentQuestion.title}</span>
                  <span className="mt-1.5 block text-base font-black leading-7 text-white sm:text-lg">{currentQuestion.prompt}</span>
                </span>
              </span>
            </legend>
            <div id={`satisfaction-guidance-${interactionId}-${currentQuestion.key}`} className="mt-4 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">คำชี้แจงในการตอบ</p>
              <p className="mt-1 text-xs leading-6 text-slate-400">{currentQuestion.description}</p>
            </div>
            <div className="mt-5 grid grid-cols-5 gap-1.5 sm:gap-2" aria-label={`ให้คะแนน${currentQuestion.title}`}>
              {scoreLabels.map((label, index) => {
                const score = index + 1;
                const selected = selectedScore === score;
                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setRatings((current) => ({ ...current, [currentQuestion.key]: score }))}
                    aria-label={`${score} ดาว ${label}`}
                    aria-pressed={selected}
                    className={`group flex min-h-[72px] flex-col items-center justify-center rounded-xl border px-1 py-2.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:min-h-20 sm:rounded-2xl sm:py-3 ${selected ? 'border-amber-300/50 bg-amber-300/10 text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.1)]' : 'border-white/[0.08] bg-slate-950/60 text-slate-500 hover:border-cyan-300/30 hover:text-slate-200'}`}
                  >
                    <Star className={`h-5 w-5 ${selected ? 'fill-amber-300' : 'group-hover:text-amber-200'}`} />
                    <span className="mt-1 font-mono text-xs font-black">{score}</span>
                    <span className="mt-1 hidden text-[9px] leading-tight sm:block">{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500" aria-hidden="true"><span>1 · ควรปรับปรุงมาก</span><span>5 · ดีมาก</span></div>
            {selectedScore && <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-center text-xs font-semibold text-amber-200" aria-live="polite">คุณเลือก {selectedScore} ดาว · {scoreLabels[selectedScore - 1]}</p>}
          </fieldset>
        ) : (
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/[0.08] text-violet-200"><MessageSquareText className="h-5 w-5" /></span>
              <div>
                <h3 className="text-base font-bold text-white">ข้อเสนอแนะเพิ่มเติม (ไม่บังคับ)</h3>
                <p className="mt-1 text-xs text-slate-400">บอกสิ่งที่ควรปรับปรุงได้สูงสุด 1,000 ตัวอักษร</p>
              </div>
            </div>
            <label htmlFor={`satisfaction-suggestion-${interactionId}`} className="mt-5 block text-xs font-semibold text-slate-300">ข้อเสนอแนะ</label>
            <textarea
              id={`satisfaction-suggestion-${interactionId}`}
              value={suggestion}
              onChange={(event) => setSuggestion(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="เช่น อยากให้ปุ่มค้นหาเด่นขึ้น หรืออยากให้ระบบจำตัวกรองล่าสุด… (โปรดไม่ระบุชื่อ เลขบัตร หรือข้อมูลส่วนบุคคล)"
              className="mt-2 w-full resize-y rounded-2xl border border-white/[0.1] bg-slate-950 px-4 py-3 text-sm leading-6 text-white placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>ไม่ควรใส่ข้อมูลส่วนบุคคลหรือข้อมูลคดี</span><span>{suggestion.length}/1,000</span></div>
            <div className="mt-5 flex items-center justify-center gap-1 text-amber-200" aria-label={`คะแนนรวม ${overallScore} ดาว`}>
              {Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-5 w-5 ${index < overallScore ? 'fill-amber-300 text-amber-300' : 'text-slate-700'}`} />)}
              <span className="ml-2 text-xs font-bold">คะแนนรวม {overallScore}/5</span>
            </div>
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/[0.08] p-3 text-xs text-rose-200">{error}</div>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button type="button" onClick={() => { setError(''); setStep((current) => current - 1); }} className="secondary-action inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-bold text-slate-300">
                <ChevronLeft className="h-4 w-4" /> ย้อนกลับ
              </button>
            )}
            {onCancel && (
              <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:text-slate-300">ไว้ภายหลัง</button>
            )}
          </div>
          {currentQuestion ? (
            <button
              type="button"
              disabled={!selectedScore}
              onClick={() => { setError(''); setStep((current) => current + 1); }}
              className="primary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              คำถามถัดไป <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting || completedRatings !== questions.length}
              onClick={submit}
              className="primary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSubmitting ? 'กำลังบันทึก…' : 'ส่งแบบประเมิน'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
