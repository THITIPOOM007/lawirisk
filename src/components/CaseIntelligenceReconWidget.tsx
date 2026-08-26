'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  MapPin,
  User,
  Building,
  Scale,
  FileText,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Compass,
  CheckCircle2,
  Activity,
  Printer
} from 'lucide-react';
import type { AutomatedCaseReconReport } from '@/lib/intelligence/case-recon-engine';
import type { GeneratedDocument } from '@/lib/intelligence/dossier-builder';
import { DossierViewerModal } from './DossierViewerModal';

interface CaseIntelligenceReconWidgetProps {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  description?: string;
  accusedName?: string;
  locationAddress?: string;
  autoRunOnMount?: boolean;
}

export function CaseIntelligenceReconWidget({
  caseId,
  caseNumber,
  caseTitle,
  description,
  accusedName,
  locationAddress,
  autoRunOnMount = false,
}: CaseIntelligenceReconWidgetProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<AutomatedCaseReconReport | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'DOPA' | 'HSS' | 'COUNCIL' | 'GEO' | 'LEGAL'>('DOPA');
  
  // Dossier modal state
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [dossierDocs, setDossierDocs] = useState<GeneratedDocument[]>([]);

  const runRecon = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/v1/intelligence/recon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          case_id: caseId,
          case_number: caseNumber,
          case_title: caseTitle,
          raw_text: `${caseTitle} ${description || ''}`,
          accused_name: accusedName,
          location_address: locationAddress,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || 'การสืบค้นข้อมูลเชิงลึกไม่สำเร็จ');
      setReport(body.data.report as AutomatedCaseReconReport);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสืบค้นข้อมูล');
    } finally {
      setIsRunning(false);
    }
  };

  const handleOpenDossier = async () => {
    setIsGeneratingDossier(true);
    try {
      const res = await fetch('/api/v1/intelligence/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          case_id: caseId,
          case_number: caseNumber,
          case_title: caseTitle,
          raw_text: `${caseTitle} ${description || ''}`,
          accused_name: accusedName,
          location_address: locationAddress,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || 'สร้างแฟ้มสืบสวนไม่สำเร็จ');
      setDossierDocs(body.data.documents as GeneratedDocument[]);
      if (body.data.report) setReport(body.data.report as AutomatedCaseReconReport);
      setShowDossierModal(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างแฟ้มสืบสวน');
    } finally {
      setIsGeneratingDossier(false);
    }
  };

  useEffect(() => {
    if (autoRunOnMount) {
      void runRecon();
    }
  }, [caseId]);

  return (
    <div className="rounded-3xl border border-indigo-500/30 bg-slate-900/60 p-6 space-y-6 shadow-[0_0_40px_rgba(99,102,241,0.1)]">
      
      {/* Widget Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-gradient-to-r from-indigo-500/20 to-teal-500/20 border border-indigo-400/30 text-teal-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Automated Case Intelligence & Multi-Source Recon</span>
          </div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <span>ระบบสืบค้นและรวบรวมข้อมูลคดีเชิงลึกอัตโนมัติ (5 มิติ)</span>
          </h2>
          <p className="text-xs text-slate-400">
            สืบค้นข้อมูลอัตโนมัติจาก ทะเบียนราษฎร (DOPA), สารบบสถานพยาบาล (สบส.), สภาวิชาชีพ (แพทยสภา/ทันตแพทยสภา), แผนที่พิกัดจริง และวิเคราะห์ฐานความผิด
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isRunning}
            onClick={runRecon}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-teal-300 hover:bg-teal-200 transition shadow-[0_0_20px_rgba(45,212,191,0.3)] disabled:opacity-50 cursor-pointer"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span>{report ? 'สืบค้นข้อมูลใหม่อีกครั้ง' : 'เริ่มสืบค้นข้อมูลอัตโนมัติ (Auto-Investigate)'}</span>
          </button>

          {report && (
            <button
              type="button"
              disabled={isGeneratingDossier}
              onClick={handleOpenDossier}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-[0_0_20px_rgba(99,102,241,0.3)] cursor-pointer"
            >
              {isGeneratingDossier ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              <span>สร้างแฟ้มสืบสวน & หนังสือส่งตำรวจ (1-Click)</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* When no report yet */}
      {!report && !isRunning && (
        <div className="py-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-6 space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Compass className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-white">พร้อมเริ่มการสืบค้นข้อมูลเชิงลึกอัตโนมัติ</h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            กดปุ่ม &ldquo;เริ่มสืบค้นข้อมูลอัตโนมัติ&rdquo; ด้านบน เพื่อให้ AI ตรวจสอบทะเบียนราษฎร ตรวจสถานะคลินิกเถื่อน ตรวจสอบใบประกอบวิชาชีพ ส่องแผนที่ Street View และประมวลข้อกฎหมายทันที
          </p>
        </div>
      )}

      {/* Loading state */}
      {isRunning && (
        <div className="py-16 text-center rounded-2xl bg-slate-950/60 p-6 space-y-4">
          <Loader2 className="h-10 w-10 text-teal-300 animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">กำลังสืบค้นข้อมูลคดีจาก 5 มิติอัตโนมัติ...</h3>
            <p className="text-xs text-slate-400 font-mono">
              [1/5] ทะเบียนราษฎร DOPA ➔ [2/5] สารบบ สบส. ➔ [3/5] แพทยสภา/ทันตแพทยสภา ➔ [4/5] Geocoding & Street View ➔ [5/5] วิเคราะห์ฐานความผิด
            </p>
          </div>
        </div>
      )}

      {/* Recon Result Dashboard */}
      {report && !isRunning && (
        <div className="space-y-6">
          
          {/* Critical Alert Bar */}
          {report.criticalWarnings.length > 0 && (
            <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4" />
                <span>การแจ้งเตือนความเสี่ยงวิกฤต (Critical Intelligence Flags)</span>
              </div>
              <div className="space-y-1">
                {report.criticalWarnings.map((warn, i) => (
                  <p key={i} className="text-xs font-semibold text-rose-200">{warn}</p>
                ))}
              </div>
            </div>
          )}

          {/* 5-Dimension Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
            {[
              { key: 'DOPA', label: '🏛️ ทะเบียนราษฎร (DOPA)', badge: report.dopaProfile ? 'ยืนยันตัวตนแล้ว' : 'ไม่พบ' },
              { key: 'HSS', label: '🏥 สถานพยาบาล (สบส.)', badge: report.hssClinic.isIllegalClinic ? '🚨 คลินิกเถื่อน' : 'ได้รับอนุญาต' },
              { key: 'COUNCIL', label: '🩺 สภาวิชาชีพ', badge: report.practitionerLicense.isIllegalPractitioner ? '🚨 ไม่มีใบอนุญาต' : 'แพทย์จริง' },
              { key: 'GEO', label: '🛰️ แผนที่ & Street View', badge: 'ปักหมุดแล้ว' },
              { key: 'LEGAL', label: '⚖️ ฐานความผิด & มาตรา', badge: `${report.legalAssessment.applicableCharges.length} ฐานความผิด` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'bg-teal-400/20 text-teal-200 border border-teal-400/40 shadow-[0_0_15px_rgba(45,212,191,0.2)]'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 font-mono">{tab.badge}</span>
              </button>
            ))}
          </div>

          {/* Tab 1: DOPA Civil Registry */}
          {activeTab === 'DOPA' && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">ข้อมูลบุคคลและทะเบียนราษฎร (DOPA Citizen Intelligence)</h3>
                </div>
                <span className="text-[10px] text-teal-300 font-mono bg-teal-950/60 px-2.5 py-1 rounded-lg border border-teal-500/20">
                  {report.dopaProfile?.verifiedSource || 'DOPA Verified'}
                </span>
              </div>

              {report.dopaProfile ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">ชื่อ-นามสกุล (ภาษาไทย):</span>
                    <span className="text-white font-bold text-sm">{report.dopaProfile.fullName}</span>
                    {report.dopaProfile.englishName && (
                      <span className="text-slate-400 block text-[11px] font-mono mt-0.5">{report.dopaProfile.englishName}</span>
                    )}
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">เลขประจำตัวประชาชน 13 หลัก:</span>
                    <span className="text-teal-300 font-mono font-bold text-sm tracking-wider">{report.dopaProfile.citizenId}</span>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">✓ ตรวจสอบ Checksum ถูกต้อง</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">อายุ / วันเดือนปีเกิด:</span>
                    <span className="text-white font-semibold">{report.dopaProfile.age} ปี (รหัส วดป: {report.dopaProfile.birthDateString})</span>
                    <span className="text-slate-400 block text-[11px]">เพศ: {report.dopaProfile.gender} | สถานะ: {report.dopaProfile.homeStatus}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">ชื่อบิดา:</span>
                    <span className="text-white font-semibold">{report.dopaProfile.fatherName} (สัญชาติ {report.dopaProfile.fatherNationality})</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">ชื่อมารดา:</span>
                    <span className="text-white font-semibold">{report.dopaProfile.motherName} (สัญชาติ {report.dopaProfile.motherNationality})</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 sm:col-span-2 lg:col-span-1">
                    <span className="text-slate-500 block text-[10px]">ที่อยู่ตามทะเบียนราษฎร:</span>
                    <span className="text-white font-semibold leading-relaxed">{report.dopaProfile.registeredAddress}</span>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs">ไม่พบข้อมูลในสารบบทะเบียนราษฎร</div>
              )}
            </div>
          )}

          {/* Tab 2: HSS Clinic Verification */}
          {activeTab === 'HSS' && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-teal-300" />
                  <h3 className="text-sm font-bold text-white">ผลการตรวจสอบสารบบสถานพยาบาล กรม สบส. (HSS Clinic Check)</h3>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                  report.hssClinic.isIllegalClinic
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {report.hssClinic.isIllegalClinic ? '🚨 คลินิกเถื่อน (ไม่ได้รับอนุญาต)' : 'สถานพยาบาลถูกต้อง'}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-2">
                  <span className="text-rose-300 font-bold block">ข้อสรุปผลการตรวจสอบโดยระบบ:</span>
                  <p className="text-slate-200 leading-relaxed">{report.hssClinic.findingsSummary}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">ชื่อสถานประกอบการที่ระบุ:</span>
                    <span className="text-white font-bold">{report.hssClinic.facilityName}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">เลขที่ใบอนุญาตสถานพยาบาล (11 หลัก):</span>
                    <span className="text-rose-400 font-mono font-bold">{report.hssClinic.licenseNumber || 'ไม่มี (ไม่เคยได้รับอนุญาต)'}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">ผู้รับอนุญาต / ผู้ดำเนินการ:</span>
                    <span className="text-white font-semibold">{report.hssClinic.operatorName}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">แหล่งตรวจสอบอ้างอิง:</span>
                    <span className="text-teal-300 font-semibold">{report.hssClinic.verifiedSource}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Council License Verification */}
          {activeTab === 'COUNCIL' && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">ผลการตรวจสอบสภาวิชาชีพ (แพทยสภา / ทันตแพทยสภา)</h3>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                  report.practitionerLicense.isIllegalPractitioner
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {report.practitionerLicense.isIllegalPractitioner ? '🚨 ไม่มีใบประกอบวิชาชีพ (หมอเถื่อน)' : 'แพทย์ผู้ได้รับใบอนุญาต'}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-2">
                  <span className="text-rose-300 font-bold block">ข้อสรุปผลการตรวจสอบสภาวิชาชีพ:</span>
                  <p className="text-slate-200 leading-relaxed">{report.practitionerLicense.findingsSummary}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">สภาวิชาชีพที่ทำการตรวจสอบ:</span>
                    <span className="text-white font-bold">{report.practitionerLicense.councilNameTh}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">เลขที่ใบประกอบวิชาชีพ (ว./ท./พ./ภ.):</span>
                    <span className="text-rose-400 font-mono font-bold">{report.practitionerLicense.licenseNumber || 'ไม่มี (ไม่พบในสารบบสภาวิชาชีพ)'}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">สถานะวิชาชีพ:</span>
                    <span className="text-rose-300 font-semibold">{report.practitionerLicense.professionTitle}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">ฐานข้อมูลอ้างอิง:</span>
                    <span className="text-teal-300 font-semibold">{report.practitionerLicense.verifiedSource}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Geocoding & Street View Recon */}
          {activeTab === 'GEO' && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-rose-400" />
                  <h3 className="text-sm font-bold text-white">การลาดตระเวนสถานที่และพิกัดจริง (Street View Reconnaissance)</h3>
                </div>
                <div className="flex gap-2">
                  <a
                    href={report.locationRecon.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-300 text-[11px] rounded-lg transition"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>เปิด Google Maps</span>
                  </a>
                  <a
                    href={report.locationRecon.streetViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-teal-500/20 hover:bg-teal-500/40 border border-teal-500/30 text-teal-300 text-[11px] rounded-lg transition"
                  >
                    <Compass className="h-3 w-3" />
                    <span>เปิด Street View 360°</span>
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <div className="space-y-3">
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">พิกัดดาวเทียม (GPS Coordinates):</span>
                    <span className="text-teal-300 font-mono font-bold text-sm">
                      {report.locationRecon.latitude.toFixed(6)}° N, {report.locationRecon.longitude.toFixed(6)}° E
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">ที่อยู่สถานที่เป้าหมาย:</span>
                    <span className="text-white font-semibold leading-relaxed">{report.locationRecon.formattedAddress}</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">ข้อความป้ายหน้าร้านที่ตรวจจับได้ (Signage OCR):</span>
                    <span className="text-amber-300 font-semibold">{report.locationRecon.capturedSignText || 'ไม่มีข้อมูล'}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-teal-300 font-bold block">บันทึกการลาดตระเวนและประเมินสถานที่ (Surveillance Notes):</span>
                  <p className="text-slate-300 leading-relaxed">{report.locationRecon.surveillanceNotes}</p>
                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <strong>ลักษณะอาคาร:</strong> {report.locationRecon.buildingType}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Legal Assessment */}
          {activeTab === 'LEGAL' && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">การวิเคราะห์ข้อกฎหมายและฐานความผิด (Legal Assessment)</h3>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  ระดับความเร่งด่วน: {report.legalAssessment.overallRiskLevel} ({report.legalAssessment.urgencyScore}/100)
                </span>
              </div>

              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2 text-xs">
                <span className="text-amber-300 font-bold block">บทสรุปทางคดีสำหรับพนักงานเจ้าหน้าที่:</span>
                <p className="text-slate-200 leading-relaxed">{report.legalAssessment.executiveSummary}</p>
              </div>

              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  ฐานความผิดที่เข้าข่ายดำเนินคดี ({report.legalAssessment.applicableCharges.length} ข้อหา):
                </span>
                {report.legalAssessment.applicableCharges.map((charge) => (
                  <div key={charge.code} className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{charge.actTitleTh}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        charge.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {charge.severity}
                      </span>
                    </div>
                    <p className="text-teal-300 font-semibold">{charge.sectionTh}</p>
                    <p className="text-slate-400 leading-relaxed">{charge.elementsDescription}</p>
                    <div className="p-2 bg-slate-950 rounded-lg border border-slate-900 text-rose-300 font-mono text-[11px]">
                      ⚖️ <strong>อัตราโทษ:</strong> {charge.penaltyTh}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* 1-Click Dossier Modal */}
      <DossierViewerModal
        isOpen={showDossierModal}
        onClose={() => setShowDossierModal(false)}
        report={report}
        documents={dossierDocs}
      />

    </div>
  );
}
