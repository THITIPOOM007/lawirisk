'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Upload, Check, AlertCircle, FileCheck, Loader2, Database, Shield } from 'lucide-react';
import { getCases, getEvidence, saveEvidence, Case, EvidenceFile } from '@/lib/demo-data';
import { validateFileInBrowser } from '@/lib/file-validator';

export default function EvidencePage() {
  const [casesList, setCasesList] = useState<Case[]>([]);
  const [evidenceList, setEvidenceList] = useState<EvidenceFile[]>([]);
  
  // Form State
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Live validation checklist state
  const [validationSteps, setValidationSteps] = useState<{
    size: 'pending' | 'success' | 'failed';
    extension: 'pending' | 'success' | 'failed';
    magic: 'pending' | 'success' | 'failed';
    hash: 'pending' | 'success' | 'failed';
  }>({
    size: 'pending',
    extension: 'pending',
    magic: 'pending',
    hash: 'pending',
  });
  const [computedHash, setComputedHash] = useState('');
  const [computedMagicBytes, setComputedMagicBytes] = useState('');

  useEffect(() => {
    setCasesList(getCases());
    setEvidenceList(getEvidence());
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setErrorMessage('');
    setSuccessMessage('');
    setComputedHash('');
    setComputedMagicBytes('');
    
    if (!file) {
      setValidationSteps({ size: 'pending', extension: 'pending', magic: 'pending', hash: 'pending' });
      return;
    }

    // Reset checklist to scanning state
    setValidationSteps({ size: 'pending', extension: 'pending', magic: 'pending', hash: 'pending' } as any);

    // Step 1: Size
    const isSizeOk = file.size <= 20 * 1024 * 1024;
    setValidationSteps(prev => ({ ...prev, size: isSizeOk ? 'success' : 'failed' }));

    // Step 2: Extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isExtOk = !!ext && ['pdf', 'png', 'jpg', 'jpeg'].includes(ext);
    setValidationSteps(prev => ({ ...prev, extension: isExtOk ? 'success' : 'failed' }));

    if (!isSizeOk || !isExtOk) return;

    // Full validation (Hash & Magic Bytes)
    setIsUploading(true);
    const result = await validateFileInBrowser(file);
    setIsUploading(false);

    if (result.isValid) {
      setValidationSteps(prev => ({ ...prev, magic: 'success', hash: 'success' }));
      setComputedHash(result.sha256 || '');
      setComputedMagicBytes(result.magicBytes || '');
    } else {
      setValidationSteps(prev => ({
        ...prev,
        magic: result.error?.includes('Magic') ? 'failed' : 'success',
        hash: result.error?.includes('Hash') ? 'failed' : 'success',
      }));
      setErrorMessage(result.error || 'ไฟล์ไม่ผ่านการตรวจสอบความปลอดภัย');
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

    if (!selectedFile) {
      setErrorMessage('กรุณาเลือกไฟล์หลักฐาน');
      return;
    }

    setIsUploading(true);

    // Re-verify file before uploading
    const validation = await validateFileInBrowser(selectedFile);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'การตรวจสอบความปลอดภัยล้มเหลว');
      setIsUploading(false);
      return;
    }

    // Save metadata
    try {
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };

      const creator = getCookie('mock-auth-name') 
        ? decodeURIComponent(getCookie('mock-auth-name')!) 
        : 'เจ้าหน้าที่สืบสวน';

      const newEvidence: EvidenceFile = {
        id: `ev-${Date.now()}`,
        case_id: selectedCaseId,
        filename: selectedFile.name,
        file_path: `/vault/${selectedCaseId}/${selectedFile.name}`,
        file_size: selectedFile.size,
        mime_type: selectedFile.type,
        sha256: validation.sha256 || 'unknown',
        status: 'PROCESSED', // Automate success for demo
        created_by: creator,
        created_at: new Date().toISOString(),
      };

      // Save using stateful demoDB
      saveEvidence(newEvidence);

      // Refresh listings
      setEvidenceList(getEvidence());
      setSuccessMessage('อัปโหลดและตรวจสอบหลักฐานเรียบร้อยแล้ว (ข้อมูลบันทึกสำเร็จ)');
      
      // Reset form
      setSelectedFile(null);
      setSelectedCaseId('');
      setValidationSteps({ size: 'pending', extension: 'pending', magic: 'pending', hash: 'pending' });
    } catch (err: any) {
      setErrorMessage(err.message || 'ไม่สามารถบันทึกข้อมูลหลักฐานได้');
    } finally {
      setIsUploading(false);
    }
  };

  const getStepIcon = (status: 'pending' | 'success' | 'failed') => {
    if (status === 'success') return <Check className="h-5 w-5 text-emerald-400 shrink-0" />;
    if (status === 'failed') return <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />;
    return <div className="h-5 w-5 rounded-full border-2 border-slate-700 shrink-0" />;
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <FileText className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>ทะเบียนและนำเข้าหลักฐาน (Evidence Intake)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          ลงทะเบียนพยานหลักฐานดิจิทัล ตรวจสอบรหัส Hash, ความถูกต้องของประเภทไฟล์ในเบื้องต้น ป้องกันไฟล์ปลอมปน
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
                  ไฟล์หลักฐาน (PDF, PNG, JPG - ไม่เกิน 20MB)
                </label>
                <div className="mt-2 flex justify-center rounded-2xl border-2 border-dashed border-slate-800 hover:border-indigo-500/40 bg-slate-950/40 px-6 py-6 transition-all duration-200">
                  <div className="text-center space-y-2">
                    <Upload className="mx-auto h-8 w-8 text-slate-500" />
                    <div className="flex text-sm text-slate-400">
                      <label className="relative cursor-pointer rounded-md font-semibold text-indigo-400 hover:text-indigo-300 focus-within:outline-none">
                        <span>เลือกไฟล์อัปโหลด</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    {selectedFile && (
                      <p className="text-xs text-white font-medium truncate max-w-[200px]">
                        {selectedFile.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Validation Checklist UI */}
              {selectedFile && (
                <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-3.5">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    ผลตรวจความปลอดภัยฝั่ง Browser (Magic Bytes & Hash)
                  </span>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-2 text-xs">
                      {getStepIcon(validationSteps.size)}
                      <span className="text-slate-300">ขนาดไฟล์ไม่เกิน 20 MB</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs">
                      {getStepIcon(validationSteps.extension)}
                      <span className="text-slate-300">นามสกุลไฟล์ถูกต้อง (.pdf, .png, .jpg)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs">
                      {getStepIcon(validationSteps.magic)}
                      <span className="text-slate-300">ความถูกต้องโครงสร้างไฟล์ (Magic Bytes)</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs">
                      {getStepIcon(validationSteps.hash)}
                      <span className="text-slate-300">คำนวณรหัส SHA-256 สำเร็จ</span>
                    </div>
                  </div>

                  {computedHash && (
                    <div className="pt-2 border-t border-slate-900 space-y-1.5 text-[10px]">
                      <div>
                        <span className="text-slate-500 font-medium">SHA-256:</span>
                        <p className="font-mono text-slate-300 truncate">{computedHash}</p>
                      </div>
                      {computedMagicBytes && (
                        <div>
                          <span className="text-slate-500 font-medium">Magic Bytes (Hex):</span>
                          <p className="font-mono text-slate-300">{computedMagicBytes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !selectedFile || !selectedCaseId || validationSteps.magic === 'failed'}
                className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin shrink-0" />
                    กำลังประมวลผล...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-5 w-5 mr-2 shrink-0" />
                    บันทึกหลักฐาน
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

            {evidenceList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-950 text-xs md:text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="pb-3 font-semibold">ชื่อไฟล์หลักฐาน</th>
                      <th className="pb-3 font-semibold">คดีเป้าหมาย</th>
                      <th className="pb-3 font-semibold">ขนาดไฟล์</th>
                      <th className="pb-3 font-semibold">SHA-256 Hash</th>
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
                          <td className="py-4 text-right">
                            <span className="inline-block px-2.5 py-1 text-[10px] font-semibold border rounded-lg bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                              {file.status === 'PROCESSED' ? 'ประมวลผลเสร็จสิ้น' : file.status}
                            </span>
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
    </div>
  );
}
