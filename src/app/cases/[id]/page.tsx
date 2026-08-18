'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, FileCheck2, FileText, Fingerprint, Loader2, Scale, ShieldAlert, Sparkles } from 'lucide-react';
import type { Case, EvidenceFile } from '@/lib/demo-data';

export default function CaseDetailsPage() {
  const params = useParams<{ id: string }>();
  const caseId = params.id;
  const [caseRecord, setCaseRecord] = useState<Case | null>(null);
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/cases/${encodeURIComponent(caseId)}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดรายละเอียดสำนวนคดีไม่สำเร็จ');
        setCaseRecord(body.data.case as Case);
        setEvidence(body.data.evidence as EvidenceFile[]);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดสำนวนคดีไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [caseId]);

  const download = async (item: EvidenceFile) => {
    setDownloadingId(item.id);
    setDownloadError('');
    try {
      const response = await fetch(`/api/v1/evidence/${encodeURIComponent(item.id)}/download`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ');
      window.location.assign(body.data.url as string);
    } catch (caught: unknown) {
      setDownloadError(caught instanceof Error ? caught.message : 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setDownloadingId('');
    }
  };

  if (isLoading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดสำนวน...</div>;
  if (error || !caseRecord) return <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-rose-300">{error || 'ไม่พบสำนวนคดี'}</div>;

  return (
    <div className="space-y-8">
      <header><Link href="/cases" className="inline-flex items-center text-xs text-slate-400 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />กลับทะเบียนคดี</Link><div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 font-mono text-xs text-indigo-300">{caseRecord.number}</span><span className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{caseRecord.status}</span></div><h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">{caseRecord.title}</h1><p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-slate-400">{caseRecord.description || 'ไม่มีรายละเอียดคดี'}</p></div><div className="flex flex-wrap gap-2"><Link href={`/review?case=${encodeURIComponent(caseId)}`} className="inline-flex items-center rounded-xl border border-amber-400/20 px-4 py-2.5 text-xs font-semibold text-amber-200"><Sparkles className="mr-2 h-4 w-4" />ตรวจข้อเสนอ</Link><Link href={`/reports?case=${encodeURIComponent(caseId)}`} className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white"><Scale className="mr-2 h-4 w-4" />สร้างรายงาน</Link></div></div></header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ['หน่วยงาน', caseRecord.jurisdiction_agency || '-'], ['พื้นที่', caseRecord.jurisdiction_region || '-'], ['สร้างเมื่อ', new Date(caseRecord.created_at).toLocaleString('th-TH')], ['หลักฐานที่เข้าถึง', `${evidence.length} ไฟล์`],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-900 bg-slate-900/30 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-2 text-sm font-semibold text-slate-200">{value}</p></div>)}</section>

      {downloadError && <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{downloadError}</div>}
      <section className="rounded-3xl border border-slate-900 bg-slate-900/30 p-6"><div className="flex items-center justify-between"><div><h2 className="flex items-center text-lg font-bold text-white"><Fingerprint className="mr-2 h-5 w-5 text-amber-300" />ทะเบียนหลักฐานต้นฉบับ</h2><p className="mt-1 text-xs text-slate-500">ไม่เปิดเผย storage path; ดาวน์โหลดผ่าน signed URL อายุสั้นและเฉพาะไฟล์ที่ STORED/CLEAN</p></div><Link href="/evidence" className="text-xs font-semibold text-indigo-300">เพิ่มหลักฐาน</Link></div>
        <div className="mt-5 space-y-3">{evidence.length ? evidence.map((item) => {
          const downloadable = item.upload_state === 'STORED' && item.malware_scan_status === 'CLEAN';
          return <article key={item.id} className="grid gap-4 rounded-2xl border border-slate-900 bg-slate-950/50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-slate-500" /><p className="truncate text-sm font-semibold text-slate-200">{item.filename}</p></div><p className="mt-2 break-all font-mono text-[10px] text-slate-600">SHA-256 {item.sha256}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px]"><span className="rounded-md border border-slate-800 px-2 py-1 text-slate-400">{item.upload_state || 'UNKNOWN'}</span><span className={`rounded-md border px-2 py-1 ${item.malware_scan_status === 'CLEAN' ? 'border-emerald-500/20 text-emerald-300' : 'border-amber-500/20 text-amber-200'}`}>SCAN {item.malware_scan_status || 'UNKNOWN'}</span></div></div><button type="button" disabled={!downloadable || downloadingId === item.id} onClick={() => void download(item)} className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">{downloadingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}ดาวน์โหลด</button></article>;
        }) : <div className="py-16 text-center"><FileCheck2 className="mx-auto h-10 w-10 text-slate-800" /><p className="mt-3 text-sm text-slate-500">ยังไม่มีหลักฐานที่เข้าถึงได้ในสำนวนนี้</p></div>}</div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs leading-6 text-sky-100"><ShieldAlert className="mt-1 h-4 w-4 shrink-0" />การค้นฐานข้อมูลภายนอก แผนลงพื้นที่ ข้อกฎหมาย และ PDF ที่ยังไม่มี backend จริงถูกนำออกจากหน้านี้ เพื่อไม่แสดงผลจำลองเป็นข้อเท็จจริงในคดี</div>
    </div>
  );
}
