'use client';

import React, { useState, useEffect } from 'react';
import { Eye, ShieldAlert, FileText, CheckCircle2, XCircle, ChevronRight, HelpCircle, Save, Database, AlertCircle } from 'lucide-react';
import { getCases, getEvidence, getEntities, saveEntity, saveMention, Case, EvidenceFile, ExtractedEntity, addAuditLog } from '@/lib/demo-data';

interface ProposedEntity {
  id: string;
  type: 'PERSON' | 'PHONE' | 'EMAIL' | 'BANK_ACCOUNT' | 'CITIZEN_ID' | 'ORGANIZATION' | 'LOCATION';
  value: string;
  snippet: string;
  page: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
}

export default function ReviewPage() {
  const [casesList, setCasesList] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [evidenceList, setEvidenceList] = useState<EvidenceFile[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [userRole, setUserRole] = useState('VIEWER');

  // Proposed AI Extractions State
  const [proposedEntities, setProposedEntities] = useState<ProposedEntity[]>([]);
  const [verificationSuccess, setVerificationSuccess] = useState('');

  // Loaded cases and files
  useEffect(() => {
    setCasesList(getCases());
    
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    setUserRole(getCookie('mock-auth-role') || 'VIEWER');
  }, []);

  // Update files dropdown when case changes
  useEffect(() => {
    if (selectedCaseId) {
      setEvidenceList(getEvidence().filter(e => e.case_id === selectedCaseId));
      setSelectedEvidenceId('');
      setProposedEntities([]);
    } else {
      setEvidenceList([]);
      setSelectedEvidenceId('');
      setProposedEntities([]);
    }
  }, [selectedCaseId]);

  // Load proposed AI entities when file changes
  useEffect(() => {
    if (selectedEvidenceId) {
      // Simulate AI extraction proposal
      setProposedEntities([
        { id: 'prop-1', type: 'PERSON', value: 'นายสมเจตน์ รวยจริง', snippet: 'พยานซัดทอดว่า นายสมเจตน์ รวยจริง เป็นผู้อยู่เบื้องหลังการทำธุรกรรม', page: 1, status: 'PENDING' },
        { id: 'prop-2', type: 'PHONE', value: '081-234-5678', snippet: 'โปรไฟล์ Line: เบอร์ติดต่อ 081-234-5678', page: 1, status: 'PENDING' },
        { id: 'prop-3', type: 'BANK_ACCOUNT', value: '123-4-56789-0 (KBANK)', snippet: 'เลขบัญชีธนาคาร 123-4-56789-0 ธนาคารกสิกรไทย', page: 3, status: 'PENDING' },
        { id: 'prop-4', type: 'CITIZEN_ID', value: '1-1002-00345-67-8', snippet: 'เลขประจำตัวประชาชน 1-1002-00345-67-8', page: 2, status: 'PENDING' },
      ]);
    } else {
      setProposedEntities([]);
    }
  }, [selectedEvidenceId]);

  const handleUpdateStatus = (id: string, status: 'CONFIRMED' | 'REJECTED' | 'PENDING') => {
    setProposedEntities(prev =>
      prev.map(item => item.id === id ? { ...item, status } : item)
    );
  };

  const handleSaveVerified = () => {
    if (userRole === 'VIEWER') {
      alert('คุณมีบทบาท VIEWER ไม่มีสิทธิ์บันทึกผลการตรวจสอบ');
      return;
    }

    const confirmed = proposedEntities.filter(p => p.status === 'CONFIRMED');
    const existingEntities = getEntities();

    confirmed.forEach(item => {
      // Check if entity already exists in this case
      const duplicate = existingEntities.find(
        e => e.case_id === selectedCaseId && e.type === item.type && e.value === item.value
      );

      if (!duplicate) {
        const newEntityId = `ent-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        // Save entity to case registry
        saveEntity({
          id: newEntityId,
          case_id: selectedCaseId,
          type: item.type,
          value: item.value,
          created_at: new Date().toISOString()
        });

        // Save entity mention
        saveMention({
          id: `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          entity_id: newEntityId,
          filename: evidenceList.find(e => e.id === selectedEvidenceId)?.filename || 'unknown',
          page_number: item.page,
          snippet: item.snippet,
          confidence: 0.95
        });
      }
    });

    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    const reviewer = getCookie('mock-auth-name') 
      ? decodeURIComponent(getCookie('mock-auth-name')!) 
      : 'เจ้าหน้าที่';

    addAuditLog(reviewer, 'EVIDENCE_REVIEW', `บันทึกผลตรวจทานไฟล์หลักฐานรหัส ${selectedEvidenceId}`);

    setVerificationSuccess('บันทึกผลการตรวจสอบเอนทิตีที่ยืนยันลงสู่ฐานข้อมูลคดีเรียบร้อยแล้ว!');
    
    // Clear selections
    setProposedEntities(prev => prev.filter(p => p.status === 'PENDING'));
    setTimeout(() => setVerificationSuccess(''), 3000);
  };

  const getEntityTypeLabel = (type: string) => {
    switch (type) {
      case 'PERSON': return 'บุคคล';
      case 'PHONE': return 'เบอร์โทรศัพท์';
      case 'EMAIL': return 'อีเมล';
      case 'BANK_ACCOUNT': return 'บัญชีธนาคาร';
      case 'CITIZEN_ID': return 'เลขบัตรประชาชน';
      default: return 'เอนทิตีอื่นๆ';
    }
  };

  const getEntityBadgeColor = (type: string) => {
    switch (type) {
      case 'PERSON': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'PHONE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'BANK_ACCOUNT': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'CITIZEN_ID': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Eye className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>AI Analysis & Human Review Workbench</span>
        </h1>
        <p className="mt-2 text-slate-400">
          ตรวจสอบข้อมูลที่ระบบ AI เสนอเพื่อสกัดเป็นทะเบียนข้อมูล (Entities) และยืนยันความถูกต้องก่อนเขียนลงฐานข้อมูลจริง
        </p>
      </div>

      {/* Case / Evidence Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 p-4 border border-slate-900 rounded-3xl">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">เลือกคดีสืบสวน</label>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="mt-2 block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
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
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">เลือกไฟล์พยานหลักฐานเพื่อตรวจสอบ</label>
          <select
            disabled={!selectedCaseId}
            value={selectedEvidenceId}
            onChange={(e) => setSelectedEvidenceId(e.target.value)}
            className="mt-2 block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm disabled:opacity-50"
          >
            <option value="">-- กรุณาเลือกไฟล์ --</option>
            {evidenceList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.filename}
              </option>
            ))}
          </select>
        </div>
      </div>

      {verificationSuccess && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-2xl flex items-start space-x-3 text-emerald-300 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <span>{verificationSuccess}</span>
        </div>
      )}

      {/* Main Workbench Layout */}
      {selectedEvidenceId ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          
          {/* Document Preview (Mock - Left 3/5) */}
          <div className="lg:col-span-3 bg-slate-900/20 border border-slate-900 rounded-3xl p-6 flex flex-col justify-between min-h-[500px]">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-900">
                <h3 className="text-base font-bold text-white flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-indigo-500" />
                  พรีวิวเอกสารหลักฐานต้นฉบับ (Mock View)
                </h3>
                <span className="text-xs text-slate-500">
                  ไฟล์: {evidenceList.find(e => e.id === selectedEvidenceId)?.filename}
                </span>
              </div>
              
              {/* Mock Content display */}
              <div className="mt-6 space-y-4 text-sm text-slate-300 leading-relaxed font-mono bg-slate-950/40 p-6 rounded-2xl border border-slate-900">
                <p className="text-slate-500">[หน้า 1]</p>
                <p>รายงานสืบสวนระบุพฤติการณ์ <span className="bg-sky-500/10 text-sky-400 px-1 py-0.5 rounded border border-sky-500/20">นายสมเจตน์ รวยจริง</span> มีพฤติกรรมเกี่ยวข้องกับเครือข่าย...</p>
                <p>ข้อมูลโปรไฟล์ Line ระบุเบอร์โทรติดต่อ <span className="bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded border border-emerald-500/20">081-234-5678</span> ติดต่อได้ 24 ชั่วโมง</p>
                
                <p className="text-slate-500 mt-6">[หน้า 2]</p>
                <p>สำเนาบัตรประชาชนแนบ ทราบชื่อ นายสมพร ม้าเร็ว รหัสบัตรประชาชน <span className="bg-rose-500/10 text-rose-400 px-1 py-0.5 rounded border border-rose-500/20">1-1002-00345-67-8</span>...</p>
                
                <p className="text-slate-500 mt-6">[หน้า 3]</p>
                <p>รายการเดินบัญชีกสิกรไทย เลขบัญชี <span className="bg-amber-500/10 text-amber-400 px-1 py-0.5 rounded border border-amber-500/20">123-4-56789-0 (KBANK)</span> ชื่อบัญชี สมเจตน์ รวยจริง มียอดเงินโอนเข้าสะสม...</p>
              </div>
            </div>

            <div className="mt-6 bg-slate-950/40 p-4 border border-slate-900 rounded-2xl flex items-start space-x-3">
              <ShieldAlert className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                **หลักการสำคัญ:** AI ทำหน้าที่เพียงเสนอข้อมูล (Propose) เท่านั้น การเขียนข้อมูลลงฐานข้อมูลจริงจะต้องได้รับการยืนยันพิกัดข้อความและรายละเอียดจากเจ้าหน้าที่ก่อนเสมอเพื่อป้องกันการ Matching ที่ผิดพลาด
              </p>
            </div>
          </div>

          {/* AI Proposed Entities side panel (Right 2/5) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center">
                  <Database className="h-5 w-5 mr-2 text-indigo-500" />
                  เอนทิตีที่สกัดโดย AI ({proposedEntities.length})
                </h3>
              </div>

              {proposedEntities.length > 0 ? (
                <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                  {proposedEntities.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        item.status === 'CONFIRMED' ? 'bg-emerald-950/10 border-emerald-500/30' :
                        item.status === 'REJECTED' ? 'bg-rose-950/10 border-rose-500/30' :
                        'bg-slate-950/60 border-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className={`px-2 py-0.5 text-[10px] font-semibold border rounded-md ${getEntityBadgeColor(item.type)}`}>
                          {getEntityTypeLabel(item.type)}
                        </span>
                        <span className="text-[10px] text-slate-500">หน้า {item.page}</span>
                      </div>

                      <p className="mt-2 text-sm font-bold text-white">{item.value}</p>
                      
                      {/* Highlighted snippet source */}
                      <p className="mt-1 text-xs text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-900/60">
                        {item.snippet}
                      </p>

                      <div className="mt-3 flex items-center justify-end space-x-2">
                        {item.status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(item.id, 'REJECTED')}
                              className="inline-flex items-center px-3 py-1.5 border border-slate-800 hover:border-rose-900 hover:bg-rose-950/20 text-xs font-semibold text-rose-400 rounded-xl transition-all cursor-pointer"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              ปฏิเสธ
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(item.id, 'CONFIRMED')}
                              className="inline-flex items-center px-3 py-1.5 border border-slate-800 hover:border-emerald-900 hover:bg-emerald-950/20 text-xs font-semibold text-emerald-400 rounded-xl transition-all cursor-pointer"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              ยืนยัน
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'PENDING')}
                            className="text-xs text-slate-500 hover:text-white underline cursor-pointer"
                          >
                            ยกเลิกตัวเลือก
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                  <p className="mt-3 text-sm text-slate-400">ตรวจสอบความถูกต้องครบถ้วนแล้ว</p>
                </div>
              )}

              {/* Action Buttons */}
              {proposedEntities.some(p => p.status !== 'PENDING') && (
                <button
                  onClick={handleSaveVerified}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all cursor-pointer"
                >
                  <Save className="h-5 w-5 mr-2 shrink-0" />
                  บันทึกผลการตรวจสอบลงคดี
                </button>
              )}
            </div>
          </div>

        </div>
      ) : (
        <div className="text-center py-20 bg-slate-900/10 border border-slate-900 border-dashed rounded-3xl">
          <Eye className="h-12 w-12 text-slate-700 mx-auto animate-pulse" />
          <h3 className="mt-4 text-lg font-semibold text-white">กรุณาเลือกคดีและไฟล์เพื่อเริ่มต้นตรวจทาน</h3>
          <p className="mt-2 text-sm text-slate-500">
            ระบบ AI จะเสนอเอนทิตีที่สกัดตรวจพบเพื่อรอการวิเคราะห์และตรวจสอบยืนยันสิทธิ์จากคุณ
          </p>
        </div>
      )}
    </div>
  );
}
