'use client';

import React, { useState } from 'react';
import { FileBarChart, Loader2, Download, Copy, FileText, Check } from 'lucide-react';
import { getCases, getEvidence, getEntities, getRelationships, Case, addAuditLog } from '@/lib/demo-data';

export default function ReportsPage() {
  const [casesList] = useState<Case[]>(() => getCases());
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [reportType, setReportType] = useState('SUMMARY');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerateReport = () => {
    if (!selectedCaseId) return;
    setIsGenerating(true);
    setGeneratedReport('');

    setTimeout(() => {
      const activeCase = casesList.find((c) => c.id === selectedCaseId);
      const associatedEvidence = getEvidence().filter((e) => e.case_id === selectedCaseId);
      const associatedEntities = getEntities().filter((ent) => ent.case_id === selectedCaseId);
      const associatedRelations = getRelationships().filter((r) => r.case_id === selectedCaseId);

      if (!activeCase) return;

      let reportText = '';

      if (reportType === 'SUMMARY') {
        reportText = `==================================================
รายงานสรุปข้อมูลคดีพนักงานสอบสวน (Case Summary Report)
==================================================
เลขรหัสคดีอ้างอิง: ${activeCase.number}
ชื่อคดีสืบสวน: ${activeCase.title}
ผู้รับผิดชอบคดี: ${activeCase.created_by}
สถานะการสืบสวน: ${activeCase.status}
วันที่บันทึกคดี: ${new Date(activeCase.created_at).toLocaleDateString('th-TH')}
--------------------------------------------------

1. พฤติการณ์และเป้าหมายสืบสวน:
${activeCase.description || 'ไม่มีรายละเอียดพฤติการณ์คดี'}

2. สถิติพยานหลักฐานดิจิทัลที่นำเข้า:
- จำนวนหลักฐานนำเข้าทั้งหมด: ${associatedEvidence.length} ไฟล์
${associatedEvidence.map(e => `  * ${e.filename} (${(e.file_size / (1024 * 1024)).toFixed(2)} MB) [Hash: ${e.sha256.substring(0, 12)}...]`).join('\n')}

3. เอนทิตีที่ได้รับการตรวจสอบยืนยัน (Confirmed Entities):
- จำนวนเอนทิตีที่เก็บรักษาในระบบ: ${associatedEntities.length} รายการ
  * บุคคล: ${associatedEntities.filter(e => e.type === 'PERSON').map(e => e.value).join(', ') || '-'}
  * เบอร์โทรศัพท์: ${associatedEntities.filter(e => e.type === 'PHONE').map(e => e.value).join(', ') || '-'}
  * บัญชีธนาคาร: ${associatedEntities.filter(e => e.type === 'BANK_ACCOUNT').map(e => e.value).join(', ') || '-'}
  * เลขบัตรประชาชน: ${associatedEntities.filter(e => e.type === 'CITIZEN_ID').map(e => e.value).join(', ') || '-'}

4. เครือข่ายความสัมพันธ์ภายในคดี (Internal Relationships):
- ยืนยันความสัมพันธ์แล้ว: ${associatedRelations.filter(r => r.status === 'VERIFIED').length} รายการ
${associatedRelations.filter(r => r.status === 'VERIFIED').map(r => {
  const src = associatedEntities.find(e => e.id === r.source_entity_id)?.value || 'N/A';
  const tgt = associatedEntities.find(e => e.id === r.target_entity_id)?.value || 'N/A';
  return `  * ${src} === [${r.type}] ===> ${tgt}`;
}).join('\n')}

--------------------------------------------------
ลงชื่อ พนักงานสืบสวนคดีเทคโนโลยีดิจิทัล
วันที่พิมพ์รายงาน: ${new Date().toLocaleDateString('th-TH')}
==================================================`;
      } else {
        reportText = `==================================================
รายงานวิเคราะห์เครือข่ายความเชื่อมโยงผู้ร่วมกระทำผิด (Case Overlap & Match Report)
==================================================
รหัสคดีอ้างอิง: ${activeCase.number}
ชื่อคดี: ${activeCase.title}
--------------------------------------------------

จากการวิเคราะห์และเปรียบเทียบข้อมูลเอนทิตีกลาง ระบบสืบพบจุดทับซ้อนและข้อมูลที่มีความเชื่อมโยงกับคดีภายนอกดังรายการต่อไปนี้:

* ตรวจพบเลขบัตรประชาชน / เบอร์โทรศัพท์ ทับซ้อนกับคดีภายนอก
* ยืนยันพฤติกรรมการเชื่อมโยงเพื่อนำไปออกหมายจับ/หมายค้นเพิ่มเติม

--------------------------------------------------
ข้อมูลความเชื่อมโยงนี้จัดทำขึ้นโดยการสกัดและจับคู่ข้อมูลเอนทิตีเพื่อใช้ประกอบการสืบสวนเท่านั้น
==================================================`;
      }

      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };
      const user = getCookie('mock-auth-name') 
        ? decodeURIComponent(getCookie('mock-auth-name')!) 
        : 'เจ้าหน้าที่';
      addAuditLog(user, 'REPORT_GENERATE', `สร้างรายงานสรุปสำหรับคดี: ${activeCase.title}`);

      setGeneratedReport(reportText);
      setIsGenerating(false);
    }, 1000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([generatedReport], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `report_${selectedCaseId}_${reportType}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <FileBarChart className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>รายงานสรุปคดี (Reports & Summaries)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          สร้างไฟล์รายงานสรุปพฤติการณ์คดี ข้อมูลพยานหลักฐานดิจิทัลที่รวบรวม และโครงข่ายความสัมพันธ์เพื่อประกอบการส่งฟ้อง
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Generator Controls (Left 1/3) */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center">
              <FileBarChart className="h-5 w-5 mr-2 text-indigo-500" />
              สร้างรายงานสรุป
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">เลือกคดีเป้าหมาย</label>
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
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">รูปแบบรายงาน</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="mt-2 block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
                >
                  <option value="SUMMARY">รายงานสรุปสาระสำคัญคดี (Summary)</option>
                  <option value="OVERLAP">รายงานวิเคราะห์การทับซ้อนและเครือข่ายร่วม (Cross-Case Linkage)</option>
                </select>
              </div>

              <button
                onClick={handleGenerateReport}
                disabled={isGenerating || !selectedCaseId}
                className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin shrink-0" />
                    กำลังสร้างรายงาน...
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 mr-2 shrink-0" />
                    สร้างรายงาน
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Generated Report viewer (Right 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 flex flex-col justify-between min-h-[480px]">
            {generatedReport ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-4 border-b border-slate-950">
                  <span className="text-xs text-slate-500">ผลลัพธ์รายงานที่สร้างสำเร็จ</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center px-3 py-1.5 bg-slate-950 hover:bg-slate-900 rounded-xl text-xs text-slate-300 font-semibold cursor-pointer border border-slate-900"
                    >
                      {copied ? <Check className="h-4 w-4 mr-1.5 text-emerald-400" /> : <Copy className="h-4 w-4 mr-1.5" />}
                      {copied ? 'คัดลอกแล้ว' : 'คัดลอกรายงาน'}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center px-3 py-1.5 bg-slate-950 hover:bg-slate-900 rounded-xl text-xs text-slate-300 font-semibold cursor-pointer border border-slate-900"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      ดาวน์โหลด (.txt)
                    </button>
                  </div>
                </div>

                <pre className="mt-4 flex-1 p-5 bg-slate-950 border border-slate-900/60 rounded-2xl font-mono text-xs md:text-sm text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {generatedReport}
                </pre>
              </div>
            ) : (
              <div className="text-center py-20 my-auto">
                <FileBarChart className="h-12 w-12 text-slate-700 mx-auto" />
                <h3 className="mt-4 text-lg font-semibold text-white">ยังไม่มีรายงานที่สร้าง</h3>
                <p className="mt-2 text-sm text-slate-500">
                  กรุณาเลือกคดีและรูปแบบทางด้านซ้ายเพื่อกดสร้างรายงาน
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
