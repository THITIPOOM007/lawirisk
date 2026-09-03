'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Upload, Check, AlertCircle, FileCheck, Loader2, Database, RefreshCw, Camera, X } from 'lucide-react';
import { getCases, getEvidence, saveEvidence, Case, EvidenceFile } from '@/lib/demo-data';
import type { EvidenceUploadGrant } from '@/lib/evidence-resumable-upload';
import { evidenceSafetyLabel, isEvidenceUsable } from '@/lib/evidence-file-status';
import { validateFileInBrowser } from '@/lib/file-validator';
import { isDemoModeEnabled } from '@/lib/supabase';

export default function EvidencePage() {
  const [casesList, setCasesList] = useState<Case[]>(() => getCases());
  const [evidenceList, setEvidenceList] = useState<EvidenceFile[]>(() => getEvidence());
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(true);
  const [registryError, setRegistryError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  
  // Form State
  const [selectedCaseId, setSelectedCaseId] = useState('');
  type QueueItem = {
    id: string;
    file: File;
    status: 'validating' | 'ready' | 'uploading' | 'finalizing' | 'pending' | 'success' | 'failed';
    sha256?: string;
    magicBytes?: string;
    progress?: number;
    error?: string;
  };
  const [fileQueue, setFileQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [retryingEvidenceId, setRetryingEvidenceId] = useState('');
  const [cancellingEvidenceId, setCancellingEvidenceId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<{ filename: string; url: string } | null>(null);
  const [previewError, setPreviewError] = useState('');

  const openImagePreview = async (evidence: EvidenceFile) => {
    setPreviewError('');
    try {
      const response = await fetch(`/api/v1/evidence/${encodeURIComponent(evidence.id)}/download`, { credentials: 'same-origin' });
      const body = await response.json().catch(() => null) as { data?: { url?: string }; error?: { message?: string } } | null;
      if (!response.ok || !body?.data?.url) throw new Error(body?.error?.message || 'เปิดภาพหลักฐานไม่สำเร็จ');
      setImagePreview({ filename: evidence.filename, url: body.data.url });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'เปิดภาพหลักฐานไม่สำเร็จ');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/v1/cases', { signal: controller.signal, credentials: 'same-origin' }),
      fetch('/api/v1/evidence', { signal: controller.signal, credentials: 'same-origin' }),
    ]).then(async ([casesResponse, evidenceResponse]) => {
      const [casesBody, evidenceBody] = await Promise.all([casesResponse.json(), evidenceResponse.json()]);
      if (!casesResponse.ok) throw new Error(casesBody.error?.message || 'โหลดรายการคดีไม่สำเร็จ');
      if (!evidenceResponse.ok) throw new Error(evidenceBody.error?.message || 'โหลดทะเบียนหลักฐานไม่สำเร็จ');
      setCasesList(casesBody.data as Case[]);
      setEvidenceList(evidenceBody.data as EvidenceFile[]);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setRegistryError(error instanceof Error ? error.message : 'โหลดทะเบียนหลักฐานไม่สำเร็จ');
    }).finally(() => setIsLoadingRegistry(false));
    return () => controller.abort();
  }, [reloadToken]);

  const addFiles = async (incoming: File[]) => {
    setErrorMessage('');
    setSuccessMessage('');
    const existingKeys = new Set(fileQueue.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const unique = incoming.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
    const remaining = Math.max(0, 20 - fileQueue.length);
    const accepted = unique.slice(0, remaining);
    if (unique.length > accepted.length) setErrorMessage('เพิ่มได้สูงสุด 20 ไฟล์ต่อชุดอัปโหลด');
    const pending = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'validating' as const,
    }));
    setFileQueue((current) => [...current, ...pending]);
    for (const item of pending) {
      const validation = await validateFileInBrowser(item.file, {
        onProgress: (progress) => setFileQueue((current) => current.map((queued) => queued.id === item.id ? { ...queued, progress } : queued)),
      });
      setFileQueue((current) => current.map((queued) => queued.id === item.id ? {
        ...queued,
        status: validation.isValid ? 'ready' : 'failed',
        sha256: validation.sha256,
        magicBytes: validation.magicBytes,
        error: validation.isValid ? undefined : validation.error || 'ไฟล์ไม่ผ่านการตรวจสอบ',
      } : queued));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const removeQueuedFile = (id: string) => {
    if (isUploading) return;
    setFileQueue((current) => current.filter((item) => item.id !== id));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedCaseId) {
      setErrorMessage('กรุณาเลือกคดีปลายทาง');
      return;
    }

    const readyFiles = fileQueue.filter((item) => item.status === 'ready');
    if (readyFiles.length === 0) {
      setErrorMessage('กรุณาเลือกไฟล์หลักฐานและรอให้ตรวจสอบเสร็จ');
      return;
    }

    setIsUploading(true);
    let succeeded = 0;
    let pending = 0;
    let failed = fileQueue.filter((item) => item.status === 'failed').length;
    for (const queued of fileQueue) {
      if (queued.status !== 'ready') continue;
      let reservationId: string | null = null;
      let objectUploaded = false;
      setFileQueue((current) => current.map((item) => item.id === queued.id ? { ...item, status: 'uploading', progress: 0, error: undefined } : item));
      try {
        if (!queued.sha256) throw new Error('ไม่พบ SHA-256 ของไฟล์ กรุณานำไฟล์ออกแล้วเลือกใหม่');
        if (isDemoModeEnabled()) {
          const body = new FormData();
          body.append('file', queued.file);
          body.append('case_id', selectedCaseId);
          const response = await fetch('/api/evidence/upload', { method: 'POST', body });
          const payload = await response.json().catch(() => null) as { success?: boolean; data?: EvidenceFile; error?: { message?: string } } | null;
          if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error?.message || 'ไม่สามารถจัดเก็บหลักฐานได้');
          saveEvidence(payload.data);
          setEvidenceList((current) => [payload.data!, ...current.filter((item) => item.id !== payload.data!.id)]);
          setFileQueue((current) => current.map((item) => item.id === queued.id ? { ...item, status: 'success', progress: 100 } : item));
          succeeded += 1;
          continue;
        }

        const reserveResponse = await fetch('/api/v1/evidence/uploads', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_id: selectedCaseId,
            filename: queued.file.name,
            file_size: queued.file.size,
            mime_type: queued.file.type,
            sha256: queued.sha256,
          }),
        });
        const reservePayload = await reserveResponse.json().catch(() => null) as { success?: boolean; data?: EvidenceUploadGrant; error?: { message?: string } } | null;
        if (!reserveResponse.ok || !reservePayload?.success || !reservePayload.data) {
          throw new Error(reservePayload?.error?.message || 'ไม่สามารถเริ่มการอัปโหลดแบบต่อเนื่องได้');
        }
        reservationId = reservePayload.data.evidence_id;
        const { uploadEvidenceResumable } = await import('@/lib/evidence-resumable-upload');
        await uploadEvidenceResumable({
          file: queued.file,
          grant: reservePayload.data,
          onProgress: (progress) => setFileQueue((current) => current.map((item) => item.id === queued.id ? { ...item, progress } : item)),
        });
        objectUploaded = true;
        setFileQueue((current) => current.map((item) => item.id === queued.id ? { ...item, status: 'finalizing', progress: 100 } : item));

        const completeResponse = await fetch(`/api/v1/evidence/uploads/${reservePayload.data.evidence_id}/complete`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        const completePayload = await completeResponse.json().catch(() => null) as {
          success?: boolean;
          data?: (EvidenceFile & { retryable?: boolean }) | { evidence_id: string; retryable: true; malware_scan_status: string };
          error?: { message?: string };
          message?: string;
        } | null;
        if (!completeResponse.ok || !completePayload?.success || !completePayload.data) {
          throw new Error(completePayload?.error?.message || 'ยืนยันหลักฐานไม่สำเร็จ');
        }
        if ('id' in completePayload.data) {
          const evidence = completePayload.data;
          setEvidenceList((current) => [evidence, ...current.filter((item) => item.id !== evidence.id)]);
          const usable = isEvidenceUsable(evidence.upload_state, evidence.malware_scan_status);
          setFileQueue((current) => current.map((item) => item.id === queued.id ? {
            ...item,
            status: usable ? 'success' : 'pending',
            error: usable ? undefined : completePayload.message || 'ไฟล์ยังรอการยืนยันจากพื้นที่จัดเก็บ',
          } : item));
          if (usable) succeeded += 1;
          else pending += 1;
        } else {
          pending += 1;
          setFileQueue((current) => current.map((item) => item.id === queued.id ? {
            ...item,
            status: 'pending',
            error: completePayload.message || 'อัปโหลดครบแล้ว แต่ยังรอการยืนยันไฟล์',
          } : item));
        }
      } catch (caught: unknown) {
        if (reservationId && !objectUploaded) {
          await fetch(`/api/v1/evidence/uploads/${reservationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
        }
        failed += 1;
        setFileQueue((current) => current.map((item) => item.id === queued.id ? { ...item, status: 'failed', error: caught instanceof Error ? caught.message : 'อัปโหลดไม่สำเร็จ' } : item));
      }
    }
    setIsUploading(false);
    if (succeeded > 0 || pending > 0) {
      setSuccessMessage(`จัดเก็บพร้อมใช้ ${succeeded} ไฟล์${pending > 0 ? ` · รอยืนยัน ${pending} ไฟล์` : ''}${failed > 0 ? ` · ไม่สำเร็จ ${failed} ไฟล์` : ''}`);
      window.dispatchEvent(new Event('ev-data-change'));
    }
    if (succeeded === 0 && pending === 0) setErrorMessage(`ยังไม่มีไฟล์ที่จัดเก็บสำเร็จ${failed ? ` · พบปัญหา ${failed} ไฟล์` : ''}`);
  };

  const retryEvidenceValidation = async (evidenceId: string) => {
    setRetryingEvidenceId(evidenceId);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await fetch(`/api/v1/evidence/uploads/${evidenceId}/complete`, { method: 'POST', credentials: 'same-origin' });
      const payload = await response.json().catch(() => null) as { success?: boolean; data?: EvidenceFile | { evidence_id: string }; message?: string; error?: { message?: string } } | null;
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error?.message || 'ยืนยันไฟล์อีกครั้งไม่สำเร็จ');
      if ('id' in payload.data) {
        const evidence = payload.data;
        setEvidenceList((current) => current.map((item) => item.id === evidence.id ? evidence : item));
      } else {
        setReloadToken((value) => value + 1);
      }
      setSuccessMessage(payload.message || 'ยืนยันไฟล์จากพื้นที่จัดเก็บแล้ว');
    } catch (caught: unknown) {
      setErrorMessage(caught instanceof Error ? caught.message : 'ยืนยันไฟล์อีกครั้งไม่สำเร็จ');
    } finally {
      setRetryingEvidenceId('');
    }
  };

  const cancelReservedEvidence = async (evidenceId: string) => {
    setCancellingEvidenceId(evidenceId);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await fetch(`/api/v1/evidence/uploads/${evidenceId}`, { method: 'DELETE', credentials: 'same-origin' });
      const payload = await response.json().catch(() => null) as { success?: boolean; data?: { cancelled?: boolean }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.success || !payload.data?.cancelled) {
        throw new Error(payload?.error?.message || 'ไม่สามารถยกเลิกรายการอัปโหลดที่ค้างได้');
      }
      setEvidenceList((current) => current.filter((item) => item.id !== evidenceId));
      setSuccessMessage('ยกเลิกรายการอัปโหลดที่ยังไม่เริ่มจัดเก็บแล้ว');
      window.dispatchEvent(new Event('ev-data-change'));
    } catch (caught: unknown) {
      setErrorMessage(caught instanceof Error ? caught.message : 'ไม่สามารถยกเลิกรายการอัปโหลดที่ค้างได้');
    } finally {
      setCancellingEvidenceId('');
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <FileText className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>คลังและระบบลงทะเบียนพยานหลักฐานดิจิทัล</span>
        </h1>
        <p className="mt-2 text-slate-400">
          ระบบลงทะเบียนและจัดเก็บพยานหลักฐานดิจิทัล พร้อมการคำนวณรหัส SHA-256 และตรวจสอบความสมบูรณ์ของโครงสร้างไฟล์ตามมาตรฐานงานตรวจพิสูจน์พยานหลักฐาน
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Upload portal (Left 1/3) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center">
              <Upload className="h-5 w-5 mr-2 text-indigo-500" />
              นำเข้าไฟล์ใหม่
            </h3>

            {errorMessage && (
              <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-2xl flex items-start space-x-3 text-red-300 text-xs">
                <AlertCircle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-2xl flex items-start space-x-3 text-emerald-300 text-xs">
                <Check className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}
            {previewError && <div role="alert" className="bg-rose-950/40 border border-rose-900/50 p-4 rounded-2xl text-xs text-rose-300">{previewError}</div>}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  เลือกคดีปลายทาง
                </label>
                <select
                  required
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="mt-2 block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm transition-all"
                >
                  <option value="">-- กรุณาเลือกคดี --</option>
                  {casesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number} - {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ไฟล์หลักฐาน (PDF, PNG, JPG · ไฟล์ละไม่เกิน 200 MB · สูงสุด 20 ไฟล์)
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`mt-2 flex justify-center rounded-2xl border-2 border-dashed px-6 py-6 transition-all duration-200 ${isDragging ? 'border-indigo-300 bg-indigo-400/[0.08]' : 'border-slate-800 bg-slate-950/40 hover:border-indigo-500/40'}`}
                >
                  <div className="text-center space-y-2">
                    <Upload className="mx-auto h-8 w-8 text-slate-500" />
                    <p className="text-xs text-slate-500">ลากหลายไฟล์มาวางที่นี่</p>
                    <div className="flex flex-wrap justify-center gap-2 text-sm text-slate-400">
                      <label className="relative cursor-pointer rounded-md font-semibold text-indigo-400 hover:text-indigo-300 focus-within:outline-none">
                        <span className="inline-flex min-h-9 items-center rounded-lg border border-indigo-300/15 px-3">เลือกจากเครื่อง</span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </label>
                      <label className="relative cursor-pointer rounded-md font-semibold text-teal-300 hover:text-teal-200 focus-within:outline-none">
                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-teal-300/15 px-3"><Camera className="h-3.5 w-3.5" />ถ่ายภาพ</span>
                        <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="sr-only" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {fileQueue.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-slate-900 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between px-1"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">ตรวจรูปแบบ · SHA-256 · อัปโหลดต่อเนื่อง</span><span className="text-[10px] text-slate-600">{fileQueue.length}/20 ไฟล์</span></div>
                  {fileQueue.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
                      <span className="mt-0.5">{item.status === 'validating' || item.status === 'uploading' || item.status === 'finalizing' ? <Loader2 className="h-4 w-4 animate-spin text-indigo-300" /> : item.status === 'failed' ? <AlertCircle className="h-4 w-4 text-rose-400" /> : item.status === 'pending' ? <AlertCircle className="h-4 w-4 text-amber-300" /> : <Check className="h-4 w-4 text-emerald-400" />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-200">{item.file.name}</p>
                        <p className={`mt-0.5 text-[9px] ${item.status === 'failed' ? 'text-rose-300' : item.status === 'pending' ? 'text-amber-300' : 'text-slate-600'}`}>
                          {item.status === 'validating' ? `กำลังคำนวณ SHA-256 แบบแบ่งส่วน ${item.progress || 0}%` : item.status === 'uploading' ? `กำลังอัปโหลดตรงไปพื้นที่ private ${item.progress || 0}%` : item.status === 'finalizing' ? 'อัปโหลดครบแล้ว · กำลังตรวจขนาด ชนิด และโครงสร้างไฟล์…' : item.status === 'success' ? 'จัดเก็บแล้ว · ตรวจขนาด ชนิด และโครงสร้างไฟล์เรียบร้อย' : item.status === 'pending' || item.status === 'failed' ? item.error : `พร้อมอัปโหลด · ${(item.file.size / 1024 / 1024).toFixed(2)} MB · SHA ${item.sha256?.slice(0, 10)}…`}
                        </p>
                        {(item.status === 'validating' || item.status === 'uploading') && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={`ความคืบหน้า ${item.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress || 0}><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-[width]" style={{ width: `${item.progress || 0}%` }} /></div>}
                      </div>
                      {item.status !== 'uploading' && item.status !== 'success' && <button type="button" onClick={() => removeQueuedFile(item.id)} disabled={isUploading} aria-label={`นำ ${item.file.name} ออกจากคิว`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-rose-300/[0.06] hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !fileQueue.some((item) => item.status === 'ready') || !selectedCaseId}
                className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin shrink-0" />
                    กำลังอัปโหลดและตรวจสอบไฟล์...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-5 w-5 mr-2 shrink-0" />
                    บันทึกหลักฐาน {fileQueue.filter((item) => item.status === 'ready').length > 0 ? `${fileQueue.filter((item) => item.status === 'ready').length} ไฟล์` : ''}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Evidence Registry Listing (Right 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center">
              <Database className="h-5 w-5 mr-2 text-indigo-500 animate-pulse" />
              ทะเบียนไฟล์หลักฐานทั้งหมดในระบบ
            </h3>

            {isLoadingRegistry ? (
              <div className="flex min-h-52 items-center justify-center text-sm text-slate-400" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดทะเบียนหลักฐาน...</div>
            ) : registryError ? (
              <div className="py-14 text-center" role="alert"><p className="text-sm text-rose-300">{registryError}</p><button type="button" onClick={() => { setIsLoadingRegistry(true); setRegistryError(''); setReloadToken((value) => value + 1); }} className="mt-4 inline-flex items-center rounded-xl border border-rose-400/20 px-4 py-2 text-xs font-semibold text-rose-200"><RefreshCw className="mr-2 h-4 w-4" />ลองใหม่</button></div>
            ) : evidenceList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-950 text-xs md:text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="pb-3 font-semibold">ชื่อไฟล์หลักฐาน</th>
                      <th className="pb-3 font-semibold">คดีเป้าหมาย</th>
                      <th className="pb-3 font-semibold">ขนาดไฟล์</th>
                      <th className="pb-3 font-semibold">SHA-256 Hash</th>
                      <th className="pb-3 font-semibold">ภาพตัวอย่าง</th>
                      <th className="pb-3 font-semibold text-right">การประมวลผล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-950/60">
                    {evidenceList.map((file) => {
                      const associatedCase = casesList.find((c) => c.id === file.case_id);
                      return (
                        <tr key={file.id} className="text-slate-300 hover:bg-slate-900/20">
                          <td className="py-4 font-medium text-white max-w-[150px] truncate">
                            {file.filename}
                          </td>
                          <td className="py-4 text-slate-400 max-w-[150px] truncate">
                            {associatedCase ? `${associatedCase.number} - ${associatedCase.title}` : 'ไม่ทราบคดี'}
                          </td>
                          <td className="py-4 text-slate-400">
                            {(file.file_size / (1024 * 1024)).toFixed(2)} MB
                          </td>
                          <td className="py-4 font-mono text-slate-500">
                            {file.sha256.substring(0, 10)}...{file.sha256.substring(file.sha256.length - 6)}
                          </td>
                          <td className="py-4">
                            {file.mime_type.startsWith('image/') ? <button type="button" onClick={() => void openImagePreview(file)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 text-[10px] font-bold text-cyan-100 hover:bg-cyan-300/[0.12]"><Camera className="h-3.5 w-3.5" />ดูภาพ</button> : <span className="text-[10px] text-slate-600">PDF/เอกสาร</span>}
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex flex-col items-end gap-2">
                              <span className={`inline-block px-2.5 py-1 text-[10px] font-semibold border rounded-lg ${isEvidenceUsable(file.upload_state, file.malware_scan_status) ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : file.malware_scan_status === 'INFECTED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
                                {evidenceSafetyLabel(file.malware_scan_status)}
                              </span>
                              {!isEvidenceUsable(file.upload_state, file.malware_scan_status) && file.malware_scan_status !== 'INFECTED' && (
                                <button type="button" onClick={() => void retryEvidenceValidation(file.id)} disabled={Boolean(retryingEvidenceId)} className="inline-flex min-h-8 items-center rounded-lg border border-amber-300/15 px-2.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-300/[0.06] disabled:opacity-50">
                                  {retryingEvidenceId === file.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}ยืนยันไฟล์อีกครั้ง
                                </button>
                              )}
                              {file.upload_state === 'RESERVED' && (
                                <button type="button" onClick={() => void cancelReservedEvidence(file.id)} disabled={Boolean(cancellingEvidenceId)} className="inline-flex min-h-8 items-center rounded-lg border border-rose-300/15 px-2.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-300/[0.06] disabled:opacity-50">
                                  {cancellingEvidenceId === file.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <X className="mr-1.5 h-3 w-3" />}ยกเลิกรายการค้าง
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 border border-slate-900 border-dashed rounded-2xl">
                <FileText className="h-10 w-10 text-slate-700 mx-auto" />
                <p className="mt-4 text-sm text-slate-500">ไม่มีประวัติการอัปโหลดไฟล์หลักฐาน</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {imagePreview && <div role="dialog" aria-modal="true" aria-label={`ภาพหลักฐาน ${imagePreview.filename}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" onClick={() => setImagePreview(null)}><div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-3xl border border-cyan-300/20 bg-slate-900 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-white">ภาพหน้าผลค้น/ภาพหลักฐานต้นฉบับ</p><p className="mt-1 break-all font-mono text-[9px] text-slate-500">{imagePreview.filename}</p></div><button type="button" onClick={() => setImagePreview(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.1] text-slate-300 hover:bg-white/[0.08]" aria-label="ปิดภาพหลักฐาน"><X className="h-4 w-4" /></button></div><img src={imagePreview.url} alt={`ภาพหลักฐาน ${imagePreview.filename}`} className="mx-auto max-h-[78vh] rounded-xl border border-white/[0.08] bg-white object-contain" /></div></div>}
    </div>
  );
}
