'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Eye,
  ExternalLink,
  ImageUp,
  Info,
  Loader2,
  ScanLine,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ProductScanResult } from '@/lib/public-product-scan-contract';

type ScanEnvelope = {
  requestId: string;
  provider: 'GEMINI';
  model: string;
  promptSchemaVersion: string;
  imageCount: number;
  result: ProductScanResult;
  registryLookup?: {
    performed: boolean;
    query: string | null;
    queryType: 'FDA_NUMBER' | 'BARCODE' | 'PRODUCT_NAME' | 'NONE';
    status: 'MATCHED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'SKIPPED';
    summary: string;
    results: Array<{
      id: string;
      title: string;
      productCategoryLabel: string;
      snippet: string;
      source: string;
      sourceUrl: string;
      status: 'SAFE' | 'WARNING' | 'REVOKED' | 'UNREGISTERED' | 'UNAVAILABLE';
      metadata?: Record<string, string>;
    }>;
  };
  privacy: { stored: boolean; note: string };
  disclaimer: string;
};

const concernCopy = {
  LOW: { label: 'ยังไม่พบจุดผิดสังเกตชัดเจน', className: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200', icon: CheckCircle2 },
  REVIEW: { label: 'มีจุดที่ควรตรวจสอบเพิ่ม', className: 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100', icon: AlertTriangle },
  HIGH: { label: 'ควรหยุดและตรวจสอบก่อนใช้', className: 'border-rose-300/25 bg-rose-300/[0.08] text-rose-100', icon: ShieldAlert },
  UNDETERMINED: { label: 'ภาพยังไม่พอสำหรับประเมิน', className: 'border-slate-300/20 bg-slate-300/[0.06] text-slate-200', icon: Info },
} as const;

const registryStatusCopy = {
  MATCHED: { label: 'พบข้อมูลในทะเบียน', className: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100' },
  NOT_FOUND: { label: 'ยังไม่พบรายการที่ตรงกัน', className: 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100' },
  UNAVAILABLE: { label: 'ต้นทางยังไม่พร้อม', className: 'border-slate-300/20 bg-slate-300/[0.06] text-slate-200' },
  SKIPPED: { label: 'ข้อมูลจากภาพยังไม่พอ', className: 'border-violet-300/20 bg-violet-300/[0.06] text-violet-100' },
} as const;

export default function PublicProductScanner({
  onSearch,
  onComplaint,
}: {
  onSearch: (query: string) => void;
  onComplaint: (prefill: { topic: string; description: string; productName: string; registrationNumber: string }) => void;
}) {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [scan, setScan] = useState<ScanEnvelope | null>(null);

  const previewUrls = useMemo(() => imageFiles.map((file) => URL.createObjectURL(file)), [imageFiles]);

  useEffect(() => () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const registryIdentifier = useMemo(() => {
    const identifiers = scan?.result.identifiers || [];
    return identifiers.find((item) => item.type === 'FDA_NUMBER')?.value
      || identifiers.find((item) => item.type === 'BARCODE')?.value
      || scan?.result.productName
      || '';
  }, [scan]);

  const chooseImages = (files: File[]) => {
    setError('');
    setScan(null);
    if (!files.length) return;
    if (files.length > 3) {
      setError('เลือกได้สูงสุด 3 ภาพต่อการสแกน');
      return;
    }
    if (files.some((file) => !['image/png', 'image/jpeg'].includes(file.type))) {
      setError('รองรับเฉพาะภาพ PNG, JPG หรือ JPEG');
      return;
    }
    if (files.some((file) => file.size <= 0)) {
      setError('รูปภาพทุกไฟล์ต้องมีข้อมูล');
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) {
      setError('ขนาดรวมของรูปภาพต้องไม่เกิน 50 MB');
      return;
    }
    setImageFiles(files);
  };

  const clearImages = () => {
    setImageFiles([]);
    setScan(null);
    setError('');
  };

  const scanImage = async () => {
    if (!imageFiles.length) {
      setError('กรุณาเลือกรูปสินค้าที่ต้องการสแกน');
      return;
    }
    setIsScanning(true);
    setError('');
    setScan(null);
    try {
      const formData = new FormData();
      imageFiles.forEach((file) => formData.append('images', file, file.name));
      const response = await fetch('/api/v1/public/product-scan', { method: 'POST', body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'วิเคราะห์ภาพไม่สำเร็จ');
      setScan(body.data as ScanEnvelope);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'วิเคราะห์ภาพไม่สำเร็จ');
    } finally {
      setIsScanning(false);
    }
  };

  const concern = scan ? concernCopy[scan.result.concernLevel] : concernCopy.UNDETERMINED;
  const ConcernIcon = concern.icon;

  return (
    <div id="public-service-panel-scan" role="tabpanel" aria-labelledby="public-service-tab-scan" className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-fuchsia-300/20 bg-gradient-to-br from-[#0b1830] via-[#081527] to-[#120d2a] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="grid lg:grid-cols-[0.88fr_1.12fr]">
          <div className="border-b border-white/[0.08] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-300 to-cyan-300 text-slate-950 shadow-[0_10px_32px_rgba(217,70,239,0.22)]"><Camera className="h-5 w-5" /></span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fuchsia-200">Visual product check</p>
                <h2 className="mt-1 text-xl font-black text-white">สแกนภาพสินค้าที่สงสัย</h2>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">เพิ่มภาพด้านหน้า ด้านหลัง หรือจุดที่สงสัยได้สูงสุด 3 ภาพ ระบบจะอ่านและวิเคราะห์ข้อมูลจากทุกมุมร่วมกัน</p>
              </div>
            </div>

            <label className="group mt-6 block cursor-pointer rounded-[24px] border border-dashed border-cyan-300/30 bg-cyan-300/[0.045] p-3 transition hover:border-cyan-200/60 hover:bg-cyan-300/[0.08] focus-within:ring-2 focus-within:ring-cyan-300/40">
              <input
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                multiple
                className="sr-only"
                aria-label="เลือกรูปสินค้าที่ต้องการสแกน"
                onChange={(event) => chooseImages(Array.from(event.target.files || []))}
              />
              {previewUrls.length ? (
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {previewUrls.map((url, index) => (
                      <div key={url} className="relative aspect-square overflow-hidden rounded-[16px] border border-white/[0.08] bg-slate-950">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`ตัวอย่างรูปสินค้าที่เลือก ภาพที่ ${index + 1}`} className="h-full w-full object-contain" />
                        <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-slate-950/75 px-2 py-0.5 text-[9px] font-black text-white backdrop-blur">ภาพ {index + 1}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[10px]">
                    <span className="font-black text-cyan-100">เลือกแล้ว {imageFiles.length}/3 ภาพ</span>
                    <span className="text-slate-500">{(imageFiles.reduce((total, file) => total + file.size, 0) / 1024 / 1024).toFixed(1)} / 50 MB · แตะเพื่อเปลี่ยนชุดภาพ</span>
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-[18px] border border-white/[0.05] bg-slate-950/45 text-center">
                  <span className="grid h-16 w-16 place-items-center rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200 transition group-hover:scale-105"><ImageUp className="h-7 w-7" /></span>
                  <p className="mt-4 text-sm font-black text-white">อัปโหลดภาพสินค้า 1–3 ภาพ</p>
                  <p className="mt-1 text-[11px] text-slate-500">PNG / JPG · ขนาดรวมไม่เกิน 50 MB</p>
                </div>
              )}
            </label>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={scanImage}
                disabled={!imageFiles.length || isScanning}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 px-4 text-sm font-black text-slate-950 shadow-[0_12px_34px_rgba(167,139,250,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
              >
                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                {isScanning ? `กำลังอ่าน ${imageFiles.length} ภาพ…` : `เริ่มสแกน ${imageFiles.length || ''} ภาพ`}
              </button>
              {imageFiles.length > 0 && (
                <button type="button" onClick={clearImages} aria-label="ลบรูปที่เลือกทั้งหมด" className="grid min-h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-rose-300/30 hover:text-rose-200"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/[0.08] p-3 text-xs leading-5 text-rose-100">{error}</p>}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-[10px] leading-5 text-slate-500">
              <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
              <span>LAWiRISK ไม่เก็บภาพเป็นเรื่องร้องเรียน ภาพจะถูกส่งเป็นไฟล์ชั่วคราวให้ Google Gemini และสั่งลบทันทีหลังวิเคราะห์ ควรตัดข้อมูลส่วนบุคคลออกก่อนอัปโหลด</span>
            </div>
          </div>

          <div className="min-h-[480px] p-5 sm:p-7">
            {!scan && !isScanning && (
              <div className="flex h-full min-h-[430px] flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-white/[0.02] px-6 text-center">
                <div className="relative grid h-24 w-24 place-items-center rounded-full border border-fuchsia-300/15 bg-fuchsia-300/[0.05]">
                  <span className="absolute inset-3 rounded-full border border-dashed border-cyan-300/20" />
                  <Sparkles className="h-8 w-8 text-fuchsia-200" />
                </div>
                <h3 className="mt-5 text-base font-black text-white">ผลสแกนจะอธิบายให้เข้าใจง่าย</h3>
                <p className="mt-2 max-w-sm text-xs leading-6 text-slate-500">แยกชื่อและข้อความที่อ่านได้ ข้อมูลทั่วไป จุดที่ควรระวัง เลขทะเบียนหรือรหัสที่พบ และขั้นตอนตรวจสอบต่อ</p>
                <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-2 text-[10px] font-bold text-slate-400">
                  <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-3">อ่านฉลาก</span>
                  <span className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] px-2 py-3">ชี้จุดตรวจเพิ่ม</span>
                  <span className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-2 py-3">แนะนำขั้นต่อไป</span>
                </div>
              </div>
            )}

            {isScanning && (
              <div className="flex h-full min-h-[430px] flex-col items-center justify-center text-center" aria-live="polite">
                <span className="relative grid h-20 w-20 place-items-center rounded-3xl border border-cyan-300/25 bg-cyan-300/[0.08]"><Loader2 className="h-8 w-8 animate-spin text-cyan-200" /><span className="absolute -inset-3 animate-pulse rounded-[30px] border border-fuchsia-300/15" /></span>
                <p className="mt-5 text-sm font-black text-white">กำลังตรวจข้อความและองค์ประกอบบนฉลาก</p>
                <p className="mt-2 text-[11px] text-slate-500">โดยทั่วไปใช้เวลาไม่เกินหนึ่งนาที</p>
              </div>
            )}

            {scan && (
              <div className="space-y-4" aria-live="polite">
                <div className={`rounded-2xl border p-4 ${concern.className}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs font-black"><ConcernIcon className="h-4 w-4" />{concern.label}</span>
                    <span className="rounded-full bg-slate-950/30 px-2.5 py-1 font-mono text-[9px]">มั่นใจ {Math.round(scan.result.confidence * 100)}%</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white">{scan.result.summary}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[['สินค้า', scan.result.productName], ['แบรนด์', scan.result.brand], ['ประเภท', scan.result.productCategory]].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><p className="text-[9px] font-bold text-slate-500">{label}</p><p className="mt-1 text-xs font-black text-white">{value || 'อ่านจากภาพไม่ได้'}</p></div>
                  ))}
                </div>

                {scan.result.identifiers.length > 0 && (
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
                    <p className="flex items-center gap-2 text-[11px] font-black text-cyan-100"><BadgeCheck className="h-4 w-4" />เลขและรหัสที่พบ</p>
                    <div className="mt-3 flex flex-wrap gap-2">{scan.result.identifiers.map((item, index) => <span key={`${item.type}-${index}`} className="rounded-full border border-cyan-300/20 bg-slate-950/35 px-3 py-1.5 font-mono text-[10px] text-white">{item.type.replace('_', ' ')} · {item.value}</span>)}</div>
                  </div>
                )}

                {scan.registryLookup && (
                  <div className="rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.07] via-cyan-300/[0.04] to-transparent p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-[11px] font-black text-emerald-100"><Search className="h-4 w-4" />ตรวจทะเบียนอัตโนมัติ</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${registryStatusCopy[scan.registryLookup.status].className}`}>{registryStatusCopy[scan.registryLookup.status].label}</span>
                    </div>
                    {scan.registryLookup.query && (
                      <p className="mt-3 text-[10px] text-slate-400">ค้นด้วย{scan.registryLookup.queryType === 'FDA_NUMBER' ? 'เลขทะเบียน' : scan.registryLookup.queryType === 'BARCODE' ? 'บาร์โค้ด' : 'ชื่อผลิตภัณฑ์'}: <strong className="font-mono text-white">{scan.registryLookup.query}</strong></p>
                    )}
                    <p className="mt-2 text-[11px] leading-5 text-slate-300">{scan.registryLookup.summary}</p>

                    {scan.registryLookup.results.filter((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status)).length > 0 && (
                      <div className="mt-4 space-y-2">
                        {scan.registryLookup.results.filter((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status)).map((item) => (
                          <div key={item.id} className="rounded-xl border border-white/[0.08] bg-slate-950/45 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-black leading-5 text-white">{item.title}</p>
                                <p className="mt-1 text-[9px] font-bold text-cyan-200">{item.productCategoryLabel || 'ผลิตภัณฑ์สุขภาพ'} · {item.source}</p>
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black ${item.status === 'REVOKED' ? 'border-rose-300/25 bg-rose-300/[0.08] text-rose-100' : item.status === 'WARNING' ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100' : 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100'}`}>{item.status === 'REVOKED' ? 'ยกเลิก/สิ้นอายุ' : item.status === 'WARNING' ? 'ควรตรวจสถานะ' : 'พบในทะเบียน'}</span>
                            </div>
                            <p className="mt-2 text-[10px] leading-5 text-slate-400">{item.snippet}</p>
                            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-black text-cyan-200 hover:text-cyan-100">เปิดข้อมูลต้นฉบับ <ExternalLink className="h-3 w-3" /></a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <ResultList title="ข้อมูลทั่วไปที่พบ" icon={Info} items={scan.result.generalInformation} empty="ยังอ่านข้อมูลทั่วไปจากภาพไม่ได้" tone="cyan" />
                  <ResultList title="จุดที่ควรตรวจเพิ่ม" icon={AlertTriangle} items={scan.result.concernSignals.map((item) => `${item.label}: ${item.detail}`)} empty="ไม่พบจุดผิดสังเกตที่อธิบายได้จากภาพนี้" tone="amber" />
                  <ResultList title="สัญญาณเชิงบวกที่มองเห็น" icon={CheckCircle2} items={scan.result.positiveSignals} empty="ยังไม่มีข้อมูลเพียงพอ" tone="emerald" />
                  <ResultList title="สิ่งที่แนะนำให้ทำต่อ" icon={Search} items={scan.result.recommendedActions} empty="ค้นเลขทะเบียนจากแหล่งทางการ" tone="violet" />
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4">
                  <p className="text-[10px] font-black text-slate-300">ข้อจำกัดของผลสแกน</p>
                  <ul className="mt-2 space-y-1.5 text-[10px] leading-5 text-slate-500">{scan.result.limitations.map((item, index) => <li key={index}>• {item}</li>)}</ul>
                  <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] leading-5 text-slate-400">{scan.disclaimer}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {registryIdentifier && <button type="button" onClick={() => onSearch(registryIdentifier)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950"><Search className="h-4 w-4" />ค้นทะเบียนจากข้อมูลที่พบ</button>}
                  <button type="button" onClick={() => {
                    const matched = scan.registryLookup?.results.find((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status));
                    const registrationNumber = matched?.metadata?.['เลขที่ใบอนุญาต'] || matched?.metadata?.['เลขใบสำคัญ/ใบอนุญาต'] || registryIdentifier;
                    onComplaint({
                      topic: `ขอให้ตรวจสอบผลิตภัณฑ์: ${matched?.title || scan.result.productName || 'ผลิตภัณฑ์จากภาพสแกน'}`,
                      description: `ผู้แจ้งเลือกส่งต่อข้อมูลจากการสแกนภาพเพื่อขอให้เจ้าหน้าที่ตรวจสอบ\n\nผลิตภัณฑ์ที่อ่านได้: ${scan.result.productName || '-'}\nเลข/รหัสที่พบ: ${registrationNumber || '-'}${matched ? `\nผลทะเบียน: ${matched.title}\nแหล่งข้อมูล: ${matched.source}\nลิงก์ต้นฉบับ: ${matched.sourceUrl}` : ''}\n\nภาพที่ใช้สแกนไม่ได้ถูกแนบโดยอัตโนมัติ โปรดเลือกแนบหลักฐานอีกครั้งหากต้องการส่งภาพ`,
                      productName: matched?.title || scan.result.productName || '',
                      registrationNumber,
                    });
                  }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-white"><ShieldAlert className="h-4 w-4 text-rose-200" />แจ้งเบาะแสพร้อมหลักฐาน</button>
                </div>
                <p className="text-center font-mono text-[8px] text-slate-600">REQUEST {scan.requestId.slice(0, 8).toUpperCase()} · วิเคราะห์ร่วมกัน {scan.imageCount} ภาพ · ไม่จัดเก็บใน LAWiRISK</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ResultList({ title, icon: Icon, items, empty, tone }: { title: string; icon: typeof Info; items: string[]; empty: string; tone: 'cyan' | 'amber' | 'emerald' | 'violet' }) {
  const tones = {
    cyan: 'text-cyan-200 bg-cyan-300/[0.05] border-cyan-300/15',
    amber: 'text-amber-200 bg-amber-300/[0.05] border-amber-300/15',
    emerald: 'text-emerald-200 bg-emerald-300/[0.05] border-emerald-300/15',
    violet: 'text-violet-200 bg-violet-300/[0.05] border-violet-300/15',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="flex items-center gap-2 text-[11px] font-black"><Icon className="h-4 w-4" />{title}</p>
      <ul className="mt-3 space-y-2 text-[10px] leading-5 text-slate-300">{(items.length ? items : [empty]).map((item, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current" /><span>{item}</span></li>)}</ul>
    </div>
  );
}
