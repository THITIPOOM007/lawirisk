'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, FileText, Database, Link2, AlertTriangle, Shield, Plus,
  CheckCircle2, Users, MapPin, Landmark, ClipboardList,
  Layers, Printer, Network, Loader2
} from 'lucide-react';
import { getCases, getEvidence, addAuditLog, type Case, type EvidenceFile } from '@/lib/demo-data';

type CaseTab = 'research' | 'evidence' | 'graph' | 'timeline' | 'legal' | 'field' | 'reports';
type FdaResult = { license: string; name: string; status: string; updated_at: string };
type OsscResult = { id: string; name: string; type: string; status: string; owner: string };

export default function CaseDetailsPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [activeTab, setActiveTab] = useState<CaseTab>('research');
  const [currentCase, setCurrentCase] = useState<Case | null>(() => getCases().find((item) => item.id === caseId) || null);
  const [evidenceList, setEvidenceList] = useState<EvidenceFile[]>(() => getEvidence().filter((item) => item.case_id === caseId));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  // Research Tab states
  const [fdaQuery, setFdaQuery] = useState('');
  const [osscQuery, setOsscQuery] = useState('');
  const [researchResults, setResearchResults] = useState<FdaResult[]>([]);
  const [osscResults, setOsscResults] = useState<OsscResult[]>([]);

  // Field mission state
  const [checklists, setChecklists] = useState([
    { id: 1, text: 'บันทึกภาพถ่ายป้ายหน้าสถานประกอบการ', checked: true },
    { id: 2, text: 'ตรวจสอบประวัติใบอนุญาตประกอบโรคศิลปะของเจ้าของร้าน', checked: false },
    { id: 3, text: 'ทำประวัติรายการอายัดเครื่องมือแพทย์ / รีเทนเนอร์จัดฟัน', checked: false },
    { id: 4, text: 'จดบันทึกพิกัดพยานเอกสาร/กล้องวงจรปิด', checked: true }
  ]);

  // Network Graph Selected Node state
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/cases/${encodeURIComponent(caseId)}`, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดรายละเอียดสำนวนคดีไม่สำเร็จ');
        setCurrentCase(body.data.case as Case);
        setEvidenceList(body.data.evidence as EvidenceFile[]);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'โหลดรายละเอียดสำนวนคดีไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [caseId]);

  if (isLoading && !currentCase) {
    return <div className="flex items-center p-8 text-slate-400" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังดึงข้อมูลรายละเอียดสำนวนคดี...</div>;
  }
  if (loadError || !currentCase) {
    return <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-rose-300" role="alert">{loadError || 'ไม่พบสำนวนคดี'}</div>;
  }

  const handleToggleChecklist = (id: number) => {
    setChecklists(prev => prev.map(c => c.id === id ? { ...c, checked: !c.checked } : c));
  };

  const handleFdaSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate CKAN / FDA Open Data query
    setResearchResults([
      { license: '10-1-00160-5-0001', name: 'ผลิตภัณฑ์น้ำดื่ม ตรา ไอร่า (Aira)', status: 'ACTIVE', updated_at: '2568-12-10' },
      { license: '12-2-00162-2-9901', name: 'โรงน้ำดื่ม ตรา วีร่า (Vera)', status: 'ACTIVE', updated_at: '2567-08-20' }
    ]);
  };

  const handleOsscSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate HSS OSSC Registration check
    setOsscResults([
      { id: '10103000268', name: 'ร้านเมย์ ทันตกรรม (ศรีสะเกษ)', type: 'คลินิกทันตกรรมทั่วไป', status: 'NOT_FOUND', owner: 'นางสาวปนัดดา คำนนท์' }
    ]);
  };

  const handleGeneratePDF = () => {
    // Audit PDF output
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    const user = getCookie('mock-auth-name') 
      ? decodeURIComponent(getCookie('mock-auth-name')!) 
      : 'เจ้าหน้าที่';
    addAuditLog(user, 'REPORT_PDF_EXPORT', `ส่งออกสำนวนรายงานสรุปทางการคดีรหัส ${caseId} เป็น PDF`);
    
    alert('สร้างไฟล์รายงานสรุปคดีสำเร็จ! บันทึก SnapShot พร้อมรหัส SHA-256 ลงในระบบตรวจสอบย้อนกลับแล้ว');
  };

  const getStatusColor = (status: string) => {
    return status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-slate-500/10 text-slate-400 border-slate-500/25';
  };

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <Link href="/cases" className="inline-flex items-center text-xs text-indigo-400 hover:text-indigo-300 font-semibold mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> ย้อนกลับไปหน้าคดีทั้งหมด
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-indigo-400 px-2.5 py-1 bg-indigo-500/5 rounded-lg border border-indigo-500/15">
                {currentCase.number}
              </span>
              <span className={`px-2.5 py-1 text-[10px] font-semibold border rounded-lg ${getStatusColor(currentCase.status)}`}>
                {currentCase.status === 'ACTIVE' ? 'กำลังดำเนินการ' : 'ปิดคดี'}
              </span>
              <span className="text-xs text-slate-500">{currentCase.jurisdiction_agency}</span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold text-white tracking-tight">{currentCase.title}</h1>
            <p className="mt-2 text-slate-400 text-sm max-w-3xl">{currentCase.description}</p>
          </div>
        </div>
      </div>

      {/* 7-Tab Navigation Layout */}
      <div className="border-b border-slate-900">
        <nav className="flex flex-wrap -mb-px gap-2">
          {[
            { id: 'research', label: 'ค้นคว้า/สืบข้อมูล (Research)' },
            { id: 'evidence', label: 'บัญชีหลักฐาน (Evidence)' },
            { id: 'graph', label: 'แผนภูมิเครือข่าย (Graph)' },
            { id: 'timeline', label: 'เส้นเวลาสืบเนื่อง (Timeline)' },
            { id: 'legal', label: 'ประมวลกฎหมาย (Legal Matrix)' },
            { id: 'field', label: 'งานภาคสนาม (Field Mobile)' },
            { id: 'reports', label: 'สรุปคดี/ส่งฟ้อง (Reports)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as CaseTab)}
              className={`pb-4 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-white hover:border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tabs Contents */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
        
        {/* Tab 1: Research */}
        {activeTab === 'research' && (
          <div className="space-y-6">
            <h3 className="text-base font-bold text-white">ระบบสืบค้นอัตโนมัติจากฐานข้อมูลทางการของรัฐ</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Thai FDA CKAN Data API Search */}
              <div className="p-5 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                  <Database className="h-4 w-4 mr-1.5" /> ฐานข้อมูล อย. (Thai FDA CKAN API)
                </h4>
                <form onSubmit={handleFdaSearch} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="เช่น น้ำดื่มไอร่า, เลขทะเบียน..."
                    value={fdaQuery}
                    onChange={(e) => setFdaQuery(e.target.value)}
                    className="flex-1 bg-slate-900 border-0 rounded-xl py-2 px-3 text-white ring-1 ring-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white rounded-xl transition-all cursor-pointer">
                    ค้นหา
                  </button>
                </form>

                {researchResults.length > 0 && (
                  <div className="space-y-2 pt-2 text-xs">
                    {researchResults.map((r, i) => (
                      <div key={i} className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white block">{r.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">อย: {r.license}</span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded">
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* HSS OSSC Portal Search */}
              <div className="p-5 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                  <Landmark className="h-4 w-4 mr-1.5" /> ฐานทะเบียนสถานพยาบาล (HSS OSSC)
                </h4>
                <form onSubmit={handleOsscSearch} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อคลินิก, ชื่อเจ้าของ..."
                    value={osscQuery}
                    onChange={(e) => setOsscQuery(e.target.value)}
                    className="flex-1 bg-slate-900 border-0 rounded-xl py-2 px-3 text-white ring-1 ring-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white rounded-xl transition-all cursor-pointer">
                    ตรวจสอบ
                  </button>
                </form>

                {osscResults.length > 0 && (
                  <div className="space-y-2 pt-2 text-xs">
                    {osscResults.map((r, i) => (
                      <div key={i} className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white block">{r.name}</span>
                          <span className="text-[10px] text-slate-500">ประเภท: {r.type} | เจ้าของ: {r.owner}</span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded">
                          ไม่พบใบอนุญาต
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Evidence */}
        {activeTab === 'evidence' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-950">
              <h3 className="text-base font-bold text-white">บัญชีวัตถุพยานพยานหลักฐานและประวัติห่วงโซ่ครอบครอง</h3>
              <Link href="/evidence" className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white rounded-xl transition-all">
                <Plus className="h-4 w-4 mr-1" /> นำเข้าพยานหลักฐานเพิ่ม
              </Link>
            </div>

            {/* List of case evidence */}
            <div className="space-y-3">
              {evidenceList.map(ev => (
                <div key={ev.id} className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <p className="font-bold text-white">{ev.filename}</p>
                    <span className="font-mono text-slate-500 block">SHA-256: {ev.sha256}</span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-lg">
                      ตรวจสอบมัลแวร์แล้ว
                    </span>
                    <span className="text-slate-500">
                      ขนาด: {(ev.file_size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Chain of Custody logging */}
            <div className="p-5 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                <Shield className="h-4 w-4 mr-1.5" /> Chain of Custody Log (ประวัติการนำเข้าและสืบสิทธิ์)
              </h4>
              <div className="space-y-3.5 text-xs text-slate-400 font-mono">
                <div className="flex items-start space-x-2">
                  <span className="text-indigo-400 shrink-0">[2026-07-31 01:10:00]</span>
                  <span>นำเข้าไฟล์พยานหลักฐานและจดบันทึกประวัติต้นทางจากระบบ Kouprey Plus</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-indigo-400 shrink-0">[2026-07-31 01:10:05]</span>
                  <span>ระบบตรวจสอบความถูกต้องของรหัสแฮช (SHA-256) และสแกนมัลแวร์ผ่านเกณฑ์</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Graph */}
        {activeTab === 'graph' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center">
                <Network className="h-5 w-5 mr-2 text-indigo-500" />
                แผนภูมิเครือข่ายวิเคราะห์ความเชื่อมโยงบุคคลและวัตถุพยาน (Entity Relationship Map)
              </h3>
              <span className="text-xs text-slate-500">คลิกที่โหนดเพื่อวิเคราะห์รายละเอียดเพิ่มเติม</span>
            </div>

            {/* Beautiful Custom Interactive SVG Graph Canvas */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* SVG Canvas Area (Left 3/4) */}
              <div className="lg:col-span-3 h-96 bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden relative flex items-center justify-center">
                
                {/* Visual relationship lines */}
                <svg className="absolute inset-0 h-full w-full pointer-events-none">
                  {/* Lines between nodes */}
                  <line x1="200" y1="200" x2="350" y2="100" stroke="#6366f1" strokeWidth="2" strokeDasharray="5" />
                  <line x1="200" y1="200" x2="100" y2="100" stroke="#10b981" strokeWidth="2" />
                  <line x1="200" y1="200" x2="200" y2="300" stroke="#f59e0b" strokeWidth="2" />
                </svg>

                {/* Node 1: Target entity */}
                <button
                  onClick={() => setSelectedNode('node-target')}
                  className={`absolute top-[160px] left-[150px] w-28 p-2.5 border rounded-xl text-center text-[10px] font-bold transition-all shrink-0 ${
                    selectedNode === 'node-target' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 ring-2 ring-indigo-500' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                >
                  <Users className="h-4 w-4 mx-auto mb-1 text-indigo-500" />
                  น.ส.ปนัดดา คำนนท์
                  <span className="block text-[8px] text-slate-500 mt-0.5">ผู้ถูกร้องเรียน</span>
                </button>

                {/* Node 2: Phone */}
                <button
                  onClick={() => setSelectedNode('node-phone')}
                  className={`absolute top-[60px] left-[300px] w-28 p-2.5 border rounded-xl text-center text-[10px] font-bold transition-all shrink-0 ${
                    selectedNode === 'node-phone' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                >
                  <Link2 className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
                  062-4149791
                  <span className="block text-[8px] text-slate-500 mt-0.5">เบอร์โทรศัพท์</span>
                </button>

                {/* Node 3: Location */}
                <button
                  onClick={() => setSelectedNode('node-location')}
                  className={`absolute top-[60px] left-[50px] w-28 p-2.5 border rounded-xl text-center text-[10px] font-bold transition-all shrink-0 ${
                    selectedNode === 'node-location' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 ring-2 ring-indigo-500' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                >
                  <MapPin className="h-4 w-4 mx-auto mb-1 text-indigo-500" />
                  อ.ขุขันธ์ ศรีสะเกษ
                  <span className="block text-[8px] text-slate-500 mt-0.5">ที่เกิดเหตุ</span>
                </button>

                {/* Node 4: Evidence File */}
                <button
                  onClick={() => setSelectedNode('node-evidence')}
                  className={`absolute top-[260px] left-[150px] w-28 p-2.5 border rounded-xl text-center text-[10px] font-bold transition-all shrink-0 ${
                    selectedNode === 'node-evidence' ? 'bg-amber-600/20 border-amber-500 text-amber-400 ring-2 ring-amber-500' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                >
                  <FileText className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                  fb_ad_screenshot.png
                  <span className="block text-[8px] text-slate-500 mt-0.5">หลักฐานอ้างอิง</span>
                </button>
              </div>

              {/* Sidebar detail (Right 1/4) */}
              <div className="lg:col-span-1 p-4 bg-slate-950 border border-slate-900 rounded-2xl text-xs space-y-4">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">วิเคราะห์ความสัมพันธ์เอนทิตี</span>
                
                {selectedNode === 'node-target' && (
                  <div className="space-y-2">
                    <p className="font-bold text-white">นางสาวปนัดดา คำนนท์</p>
                    <p className="text-slate-400">บทบาท: ผู้ถูกกล่าวหาจัดทำรีเทนเนอร์จัดฟันแฟชั่นและประกอบวิชาชีพทันตกรรมโดยไม่ได้รับอนุญาตในเพจ Sisaket ศรีสะเกษทูเดย์</p>
                  </div>
                )}
                {selectedNode === 'node-phone' && (
                  <div className="space-y-2">
                    <p className="font-bold text-white">062-4149791</p>
                    <p className="text-slate-400">ความเชื่อมโยง: ปรากฏในภาพบันทึกข้อความโฆษณาจัดฟันแฟชั่นเพื่อใช้คัดจองและชำระมัดจำบริการ</p>
                  </div>
                )}
                {selectedNode === 'node-location' && (
                  <div className="space-y-2">
                    <p className="font-bold text-white">อำเภอขุขันธ์ จังหวัดศรีสะเกษ</p>
                    <p className="text-slate-400">พิกัดเกิดเหตุ: สถานที่เปิดบริการประกอบกิจการจัดฟันแฟชั่นโดยไม่ใช่แพทย์</p>
                  </div>
                )}
                {selectedNode === 'node-evidence' && (
                  <div className="space-y-2">
                    <p className="font-bold text-white">fb_ad_screenshot.png</p>
                    <p className="text-slate-400">พยานวัตถุดิจิทัล: บันทึกหน้าจอโพสต์ Facebook ปักหมุดโฆษณา มีรหัส SHA-256 บันทึกความปลอดภัยสมบูรณ์</p>
                  </div>
                )}
                {!selectedNode && (
                  <p className="text-slate-500 italic">เลือกโหนดบนแผนภูมิเพื่อดูประวัติความสัมพันธ์</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Timeline */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            <h3 className="text-base font-bold text-white">เส้นเวลาลำดับเหตุการณ์เชิงสืบสวนคดี (Timeline Chronology)</h3>
            
            {/* Visual Timeline component */}
            <div className="relative border-l-2 border-slate-900 ml-4 pl-6 space-y-8 text-xs">
              <div className="relative">
                <span className="absolute -left-[31px] top-0 bg-indigo-500 h-4 w-4 rounded-full border-2 border-slate-950"></span>
                <span className="text-indigo-400 font-mono">[2569-07-31]</span>
                <h4 className="font-bold text-white mt-1">รับเรื่องร้องเรียนสำเร็จผ่านช่องทาง Kouprey Plus (env-1)</h4>
                <p className="text-slate-400 mt-1">เจ้าหน้าที่ตรวจแยกคำร้องและสร้างสำนวนคดี ค.123/2569 อนุมัติการเปิดสำนวนสืบสวนเป็นลายลักษณ์อักษร</p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-0 bg-emerald-500 h-4 w-4 rounded-full border-2 border-slate-950"></span>
                <span className="text-emerald-400 font-mono">[2569-07-30]</span>
                <h4 className="font-bold text-white mt-1">ตรวจพบการโพสต์โฆษณาบนหน้าเพจ Facebook ท้องถิ่น</h4>
                <p className="text-slate-400 mt-1">มีการปักหมุดข้อความรับสั่งทำเครื่องคงสภาพฟัน (รีเทนเนอร์) และงานคลินิกจัดฟันแฟชั่น</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Legal */}
        {activeTab === 'legal' && (
          <div className="space-y-6">
            <h3 className="text-base font-bold text-white">ประมวลและเปรียบเทียบฐานความผิดทางกฎหมาย (Legal Matrix)</h3>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-950 text-xs">
                <thead>
                  <tr className="text-slate-400 text-left font-medium">
                    <th className="pb-3">ข้อหา / ฐานความผิด</th>
                    <th className="pb-3">ข้อบทกฎหมายอ้างอิง</th>
                    <th className="pb-3">พยานหลักฐานประกอบในสำนวน</th>
                    <th className="pb-3">ช่องว่างหลักฐาน (Evidence Gaps)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-950/60 text-slate-300">
                  <tr className="hover:bg-slate-900/10">
                    <td className="py-4 font-bold text-white">ประกอบวิชาชีพทันตกรรมโดยไม่ได้รับอนุญาต</td>
                    <td className="py-4">พรบ.วิชาชีพทันตกรรม พ.ศ. 2537 มาตรา 28</td>
                    <td className="py-4">ภาพบันทึกหน้าจอโฆษณาระบุการดัดฟันแฟชั่นและเครื่องมือแพทย์</td>
                    <td className="py-4">
                      <span className="inline-flex items-center text-emerald-400 font-semibold">
                        <CheckCircle2 className="h-4 w-4 mr-1" /> หลักฐานเพียงพอ
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/10">
                    <td className="py-4 font-bold text-white">ประกอบกิจการสถานพยาบาลโดยไม่ได้รับอนุญาต</td>
                    <td className="py-4">พรบ.สถานพยาบาล พ.ศ. 2541 มาตรา 16</td>
                    <td className="py-4">สืบสวนระบุพิกัดที่เกิดเหตุประกอบการบริการหัตถการในช่องปาก</td>
                    <td className="py-4">
                      <span className="inline-flex items-center text-amber-400 font-semibold">
                        <AlertTriangle className="h-4 w-4 mr-1" /> ขาดคำให้การของลูกค้า
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 6: Field */}
        {activeTab === 'field' && (
          <div className="space-y-6">
            <h3 className="text-base font-bold text-white">รายการภารกิจตรวจสอบและแผนลงตรวจภาคสนาม (Field Mobile Simulation)</h3>
            <p className="text-xs text-slate-400">
              จำลองหน้ารายการสั่งการและเช็คลิสต์บนมือถือเจ้าหน้าที่ (Online-First Mode สำหรับลงตรวจออฟไลน์)
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Checklist panel */}
              <div className="p-5 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                  <ClipboardList className="h-4 w-4 mr-1.5" /> เช็คลิสต์ตรวจสอบภาคสนาม
                </h4>
                <div className="space-y-2 text-xs">
                  {checklists.map(item => (
                    <label key={item.id} className="flex items-center space-x-2.5 p-3.5 bg-slate-900 rounded-xl border border-slate-800/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleToggleChecklist(item.id)}
                        className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                      />
                      <span className={item.checked ? 'text-slate-500 line-through' : 'text-slate-200'}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Seized Assets Asset lists */}
              <div className="p-5 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                  <Layers className="h-4 w-4 mr-1.5" /> รายการสิ่งของที่ตรวจยึดและอายัด (Seized Assets Ledger)
                </h4>
                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between">
                    <span>1. เครื่องอบฆ่าเชื้อ (Autoclave) ขนาดพกพา</span>
                    <span className="font-bold text-white">ยึดของกลาง</span>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between">
                    <span>2. เครื่องมือและลวดดัดฟันสำเร็จรูป</span>
                    <span className="font-bold text-white">ยึดของกลาง</span>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between">
                    <span>3. น้ำยาเตรียมหัตถการและเจลล้างแผล</span>
                    <span className="font-bold text-white">ทำลาย/อายัด</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Reports */}
        {activeTab === 'reports' && (
          <div className="space-y-6 text-xs">
            <div className="flex justify-between items-center pb-3 border-b border-slate-950">
              <h3 className="text-base font-bold text-white">ระบบจัดพิมพ์รายงานสรุปผลคดีอย่างเป็นทางการ (Official Report snapshot)</h3>
              <button
                onClick={handleGeneratePDF}
                className="inline-flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white rounded-xl transition-all cursor-pointer"
              >
                <Printer className="h-4 w-4 mr-1.5" /> สร้างรายงาน PDF ทันที
              </button>
            </div>

            {/* Official PDF Preview Structure */}
            <div className="p-6 bg-white text-slate-900 rounded-2xl space-y-4 font-serif max-w-xl mx-auto shadow-xl border border-slate-200">
              <div className="text-center font-bold text-sm text-red-600 tracking-wider">
                ลับ (SECRET)
              </div>
              <div className="text-center font-bold text-xs uppercase">
                เอกสารบันทึกสรุปผลคดีความผิดพนักงานสอบสวน
              </div>
              
              <div className="border-t border-slate-300 pt-3 text-[10px] space-y-1">
                <p><strong>เลขคดีสืบสวน:</strong> {currentCase.number}</p>
                <p><strong>ชื่อคดี:</strong> {currentCase.title}</p>
                <p><strong>หน่วยงานรับผิดชอบ:</strong> {currentCase.jurisdiction_agency} | เขตภูมิภาค: {currentCase.jurisdiction_region}</p>
                <p><strong>ผู้รับรองสำนวนคดี:</strong> ร.ต.อ. สมชาย (เจ้าหน้าที่ผู้รับผิดชอบคดี)</p>
              </div>

              <div className="border-t border-slate-300 pt-3 text-[10px] leading-relaxed">
                <p className="font-bold mb-1">สรุปสาระสำคัญข้อเท็จจริงคดี:</p>
                <p>{currentCase.description}</p>
              </div>

              <div className="border-t border-slate-300 pt-3 text-[9px] text-slate-500 text-center">
                จัดพิมพ์และตรวจสอบความถูกต้องเชิงพยานเอกสารดิจิทัลโดยระบบสืบสวนระดับประเทศ EvidenceVerse
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
