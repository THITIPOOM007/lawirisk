'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, Database, Settings, HelpCircle, Save, FileText, Loader2, Link2 } from 'lucide-react';
import {
  getIntakeEnvelopes,
  getIntakeMessages,
  getIntakeParticipants,
  getIntakeAttachments,
  getDuplicateCandidates,
  getCases,
  saveCase,
  saveTriageDecision,
  updateIntakeEnvelopeStatus,
  saveEvidence,
  IntakeEnvelope,
  IntakeMessage,
  IntakeParticipant,
  IntakeAttachment,
  IntakeDuplicateCandidate,
  Case,
  addAuditLog
} from '@/lib/demo-data';

export default function IntakeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const intakeId = params.id as string;

  const [envelope, setEnvelope] = useState<IntakeEnvelope | null>(null);
  const [message, setMessage] = useState<IntakeMessage | null>(null);
  const [participants, setParticipants] = useState<IntakeParticipant[]>([]);
  const [attachments, setAttachments] = useState<IntakeAttachment[]>([]);
  const [duplicates, setDuplicates] = useState<IntakeDuplicateCandidate[]>([]);
  const [casesList, setCasesList] = useState<Case[]>([]);

  // Triage form states
  const [triageAction, setTriageAction] = useState<'CREATE_CASE' | 'MERGE_INTAKE' | 'REQUEST_MORE_INFO' | 'REJECT_SPAM'>('CREATE_CASE');
  const [triageReason, setTriageReason] = useState('');
  const [mergeCaseId, setMergeCaseId] = useState('');
  
  // New Case form states
  const [newCaseNumber, setNewCaseNumber] = useState('');
  const [newCaseTitle, setNewCaseTitle] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const envs = getIntakeEnvelopes();
    const env = envs.find(e => e.id === intakeId);
    if (!env) return;

    setEnvelope(env);
    setMessage(getIntakeMessages().find(m => m.envelope_id === intakeId) || null);
    setParticipants(getIntakeParticipants().filter(p => p.envelope_id === intakeId));
    setAttachments(getIntakeAttachments().filter(a => a.envelope_id === intakeId));
    setDuplicates(getDuplicateCandidates().filter(d => d.source_envelope_id === intakeId));
    setCasesList(getCases());

    // Auto fill form placeholders
    setNewCaseNumber(`ค.${Math.floor(Math.random() * 900) + 100}/2569`);
  }, [intakeId]);

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envelope) return;

    setIsSubmitting(true);
    setSuccessMessage('');

    // Simulate saving decision
    setTimeout(() => {
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };
      const user = getCookie('mock-auth-name') 
        ? decodeURIComponent(getCookie('mock-auth-name')!) 
        : 'ผู้คัดแยกคดี';

      if (triageAction === 'CREATE_CASE') {
        const newCaseId = `case-${Date.now()}`;
        saveCase({
          id: newCaseId,
          number: newCaseNumber,
          title: newCaseTitle || 'คดีสืบสวนใหม่จากการร้องเรียน',
          description: `สร้างคดีโดยการอนุมัติใบรับเรื่องร้องเรียน ${envelope.id}. เหตุผล: ${triageReason}`,
          status: 'ACTIVE',
          jurisdiction_region: envelope.jurisdiction_region,
          jurisdiction_agency: envelope.jurisdiction_agency,
          created_by: user,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        // Promote attachments to this case as official evidence files
        attachments.forEach(att => {
          saveEvidence({
            id: `ev-prom-${Date.now()}`,
            case_id: newCaseId,
            filename: att.filename,
            file_path: att.storage_path,
            file_size: att.file_size,
            mime_type: att.mime_type,
            sha256: att.sha256,
            status: 'PROCESSED',
            created_by: user,
            created_at: new Date().toISOString()
          });
        });

        updateIntakeEnvelopeStatus(envelope.id, 'PROMOTED');
      } else if (triageAction === 'MERGE_INTAKE') {
        // Promote attachments to merged case
        attachments.forEach(att => {
          saveEvidence({
            id: `ev-prom-${Date.now()}`,
            case_id: mergeCaseId,
            filename: att.filename,
            file_path: att.storage_path,
            file_size: att.file_size,
            mime_type: att.mime_type,
            sha256: att.sha256,
            status: 'PROCESSED',
            created_by: user,
            created_at: new Date().toISOString()
          });
        });

        updateIntakeEnvelopeStatus(envelope.id, 'MERGED');
      } else if (triageAction === 'REQUEST_MORE_INFO') {
        updateIntakeEnvelopeStatus(envelope.id, 'NEEDS_INFO');
      } else {
        updateIntakeEnvelopeStatus(envelope.id, 'REJECTED');
      }

      saveTriageDecision({
        id: `tri-${Date.now()}`,
        envelope_id: envelope.id,
        action: triageAction,
        reason: triageReason,
        destination_case_id: triageAction === 'MERGE_INTAKE' ? mergeCaseId : undefined,
        created_by: user,
        created_at: new Date().toISOString()
      });

      setSuccessMessage('ดำเนินการคัดกรองคำร้องเรียนและเขียนบันทึกความเห็นสำเร็จ!');
      setIsSubmitting(false);

      setTimeout(() => {
        router.push('/intake');
      }, 1500);
    }, 1200);
  };

  if (!envelope) {
    return <div className="text-slate-400 p-8">กำลังดึงข้อมูลสารบบคำร้อง...</div>;
  }

  const complainant = participants.find(p => p.role === 'COMPLAINANT');
  const accused = participants.find(p => p.role === 'ACCUSED');

  return (
    <div className="space-y-8">
      {/* Navigation breadcrumb */}
      <div>
        <Link href="/intake" className="inline-flex items-center text-xs text-indigo-400 hover:text-indigo-300 font-semibold mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> กลับไปหน้ากล่องคัดกรอง
        </Link>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <span>รายละเอียดพยานหลักฐานนำเข้า #{envelope.id}</span>
        </h1>
      </div>

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-2xl text-emerald-300 text-sm">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Left column: Original payload and details (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <h3 className="text-base font-bold text-white flex items-center pb-3 border-b border-slate-950">
              <FileText className="h-5 w-5 mr-2 text-indigo-500" />
              ต้นฉบับข้อมูลคำร้องและพยานหลักฐานแนบ (Immutable Payload)
            </h3>

            {/* Complainant metadata Box */}
            <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">ผู้แจ้งเบาะแส / Complainant</h4>
              {envelope.complainant_mode === 'ANONYMOUS' ? (
                <div className="p-3 bg-slate-900/40 rounded-xl text-xs text-slate-400 border border-slate-800 border-dashed">
                  ⚠️ ผู้ร้องเรียนเลือก **ไม่ระบุตัวตน (ANONYMOUS Complainant)**:
                  <p className="mt-1 text-[11px] text-slate-500">
                    ระบบดำเนินการคัดแยกข้อมูลและจะไม่สร้างประวัติหรือชื่อจำลองในระบบ เพื่อความปลอดภัยสูงสุดของผู้ให้เบาะแส
                  </p>
                </div>
              ) : complainant ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">ชื่อ-นามสกุล:</span>
                    <span className="text-white font-semibold">{complainant.name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">เบอร์โทรศัพท์:</span>
                    <span className="text-white font-semibold">{complainant.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">อีเมล:</span>
                    <span className="text-white font-semibold">{complainant.email || '-'}</span>
                  </div>
                </div>
              ) : (
                <span className="text-slate-500 text-xs italic">ไม่ระบุข้อมูลการติดต่อ</span>
              )}
            </div>

            {/* Accused metadata Box */}
            <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">ผู้ถูกกล่าวหา / Accused Entity</h4>
              {accused ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">ชื่อบุคคล/ห้างร้าน:</span>
                    <span className="text-white font-semibold">{accused.name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">เบอร์ติดต่อที่ระบุ:</span>
                    <span className="text-white font-semibold font-mono">{accused.phone || '-'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block">ที่อยู่/พิกัด:</span>
                    <span className="text-white font-semibold">{accused.address || '-'}</span>
                  </div>
                </div>
              ) : (
                <span className="text-slate-500 text-xs italic">ไม่ระบุรายละเอียดผู้กระทำความผิด</span>
              )}
            </div>

            {/* Raw Message Box */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">เนื้อหาข้อมูลดิบ (Raw Message Body)</span>
              <pre className="p-4 bg-slate-950 border border-slate-900/60 rounded-2xl text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {message?.raw_payload || 'ไม่มีข้อมูลนำเข้า'}
              </pre>
            </div>

            {/* Attachments Section */}
            <div className="space-y-4">
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">เอกสารหลักฐานที่แนบมา ({attachments.length})</span>
              {attachments.length > 0 ? (
                <div className="space-y-3">
                  {attachments.map(att => (
                    <div key={att.id} className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-xs">{att.filename}</p>
                        <span className="text-[10px] text-slate-500 block">ขนาด: {(att.file_size / (1024 * 1024)).toFixed(2)} MB | SHA-256: {att.sha256.substring(0, 10)}...</span>
                      </div>
                      <div>
                        {att.malware_scan_status === 'INFECTED' ? (
                          <span className="inline-flex items-center px-2 py-0.5 border border-rose-500/35 bg-rose-500/10 text-rose-400 rounded text-[10px] font-semibold animate-pulse">
                            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                            ไฟล์อันตราย
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 rounded text-[10px] font-semibold">
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            ตรวจแล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-slate-500 text-xs italic block">ไม่มีไฟล์แนบพยานหลักฐาน</span>
              )}
            </div>

          </div>
        </div>

        {/* Right column: Duplicate checks and Triage decision form (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Duplicate warnings panel */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
              การวิเคราะห์เรื่องซ้ำโดย AI
            </h3>

            {duplicates.length > 0 ? (
              <div className="space-y-3">
                {duplicates.map(dup => {
                  const targetCase = casesList.find(c => c.id === dup.target_case_id);
                  return (
                    <div key={dup.id} className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-400">พบคดีที่สอดคล้องระดับสูง ({Math.floor(dup.duplicate_score * 100)}%)</span>
                      </div>
                      <p className="text-slate-300 font-medium">
                        คดีเดิม: {targetCase ? `${targetCase.number} - ${targetCase.title}` : 'คดีเดิมหมายเลข 1'}
                      </p>
                      <div className="pt-2 border-t border-amber-900/30 flex flex-wrap gap-2 text-[10px] text-slate-400">
                        {dup.matching_signals.phone && <span className="bg-slate-900 px-2 py-0.5 rounded">เบอร์โทรตรงกัน</span>}
                        {dup.matching_signals.name_similarity && <span className="bg-slate-900 px-2 py-0.5 rounded">ชื่อเป้าหมายคล้ายคลึงกัน</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed italic">
                        **นโยบายความถูกต้อง:** ระบบไม่อนุญาตให้ทำการรวมสำนวนคดีโดยอัตโนมัติ เจ้าหน้าที่ต้องตรวจสอบและตัดสินใจด้วยตนเองเท่านั้น
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl text-center py-6">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="mt-2 text-xs text-slate-400">ไม่พบคำร้องที่ซ้ำซ้อนระดับสูงในสำนวนคดีอื่น</p>
              </div>
            )}
          </div>

          {/* Triage action workspace */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <h3 className="text-base font-bold text-white flex items-center">
              <Settings className="h-5 w-5 mr-2 text-indigo-500" />
              การตัดสินใจและส่งคดี (Triage Workspace)
            </h3>

            <form onSubmit={handleTriageSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-2">เลือกดำเนินการคัดกรอง</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="triage_action"
                      checked={triageAction === 'CREATE_CASE'}
                      onChange={() => setTriageAction('CREATE_CASE')}
                      className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                    />
                    <div>
                      <span className="font-bold text-white block">CREATE_CASE (เปิดสำนวนคดีใหม่)</span>
                      <span className="text-[10px] text-slate-500">อนุมัติขึ้นทะเบียนสำนวนใหม่ของหน่วยงาน</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="triage_action"
                      checked={triageAction === 'MERGE_INTAKE'}
                      onChange={() => setTriageAction('MERGE_INTAKE')}
                      className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                    />
                    <div>
                      <span className="font-bold text-white block">MERGE_INTAKE (ผนวกเข้ากับคดีเดิม)</span>
                      <span className="text-[10px] text-slate-500">จัดเก็บพยานหลักฐานพ่วงเข้าไปในสำนวนที่มีอยู่แล้ว</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="triage_action"
                      checked={triageAction === 'REQUEST_MORE_INFO'}
                      onChange={() => setTriageAction('REQUEST_MORE_INFO')}
                      className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                    />
                    <div>
                      <span className="font-bold text-white block">REQUEST_MORE_INFO (ขอข้อมูลเพิ่มเติม)</span>
                      <span className="text-[10px] text-slate-500">ส่งคำของข้อมูลชี้แจงกลับไปยังผู้ร้องเรียน</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="triage_action"
                      checked={triageAction === 'REJECT_SPAM'}
                      onChange={() => setTriageAction('REJECT_SPAM')}
                      className="text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                    />
                    <div>
                      <span className="font-bold text-white block">REJECT_SPAM (ปฏิเสธคำร้อง)</span>
                      <span className="text-[10px] text-slate-500">กรณีสแปม ข้อมูลเท็จ หรือไม่อยู่ในขอบข่ายกฎหมาย</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic input sections */}
              {triageAction === 'CREATE_CASE' && (
                <div className="space-y-3 p-4 bg-slate-950 border border-slate-900 rounded-2xl">
                  <h4 className="font-bold text-white block mb-1">ระบุรายละเอียดคดีใหม่</h4>
                  <div>
                    <label className="text-slate-400 block mb-1">เลขรหัสคดี</label>
                    <input
                      type="text"
                      required
                      value={newCaseNumber}
                      onChange={(e) => setNewCaseNumber(e.target.value)}
                      className="w-full bg-slate-900 border-0 rounded-xl py-2 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">ชื่อคดีสืบสวน</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น คดีบริการจัดฟันแฟชั่นผิดกฎหมาย Sisaket"
                      value={newCaseTitle}
                      onChange={(e) => setNewCaseTitle(e.target.value)}
                      className="w-full bg-slate-900 border-0 rounded-xl py-2 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>
                </div>
              )}

              {triageAction === 'MERGE_INTAKE' && (
                <div className="space-y-3 p-4 bg-slate-950 border border-slate-900 rounded-2xl">
                  <h4 className="font-bold text-white block mb-1">เลือกสำนวนคดีเดิมเป้าหมาย</h4>
                  <select
                    required
                    value={mergeCaseId}
                    onChange={(e) => setMergeCaseId(e.target.value)}
                    className="w-full bg-slate-900 border-0 rounded-xl py-2.5 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                  >
                    <option value="">-- กรุณาเลือกคดีเดิม --</option>
                    {casesList.map(c => (
                      <option key={c.id} value={c.id}>{c.number} - {c.title}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-400 font-semibold mb-1">บันทึกความเห็นของเจ้าหน้าที่คัดแยก</label>
                <textarea
                  required
                  rows={4}
                  placeholder="กรุณาระบุรายละเอียดการตรวจคัดกรอง หรือพฤติการณ์ประกอบความคิดเห็น..."
                  value={triageReason}
                  onChange={(e) => setTriageReason(e.target.value)}
                  className="w-full bg-slate-950 border-0 rounded-2xl py-3 px-4 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || (triageAction === 'MERGE_INTAKE' && !mergeCaseId)}
                className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    กำลังประมวลผลการคัดแยก...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5 mr-2" />
                    บันทึกและดำเนินการคัดกรอง
                  </>
                )}
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
