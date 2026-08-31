'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck,
  Search,
  FileText,
  ExternalLink,
  Loader2,
  Sparkles,
  CheckCircle2,
  Send,
  Lock,
  Clock,
  Compass,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';

interface SearchResultItem {
  id: string;
  title: string;
  category: string;
  productCategoryLabel: string;
  snippet: string;
  source: string;
  sourceUrl: string;
  publishedDate: string;
  confidenceScore: number;
  status: 'SAFE' | 'WARNING' | 'REVOKED' | 'UNREGISTERED' | 'UNAVAILABLE';
  metadata?: Record<string, string>;
}

interface TrackingResult {
  trackingToken: string;
  receivedAt: string;
  updatedAt: string;
  status: string;
  statusLabel: string;
  progressStep: number;
  jurisdiction: string;
}

type SearchCategory = 'ALL' | 'HEALTH_PRODUCTS' | 'HEALTH_SERVICES' | 'FRAUD_ALERTS' | 'COMPANIES' | 'LICENSES';

export default function PublicPortalPage() {
  const [activeTab, setActiveTab] = useState<'SEARCH' | 'COMPLAINT' | 'TRACK'>('SEARCH');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('ALL');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [aiSummary, setAiSummary] = useState('');

  // Complaint Form State
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [complaintCategory, setComplaintCategory] = useState<'HEALTH_HAZARD' | 'ONLINE_FRAUD' | 'ILLEGAL_CLINIC' | 'OTHER'>('ONLINE_FRAUD');
  const [region, setRegion] = useState('');
  const [complainantName, setComplainantName] = useState('');
  const [complainantContact, setComplainantContact] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [incidentTime, setIncidentTime] = useState('');
  const [incidentLocation, setIncidentLocation] = useState('');
  const [productName, setProductName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [purchaseDetails, setPurchaseDetails] = useState('');
  const [desiredAction, setDesiredAction] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [complaintSuccessToken, setComplaintSuccessToken] = useState('');
  const [complaintValidationStatus, setComplaintValidationStatus] = useState<string | null>(null);
  const [complaintPreliminarySearch, setComplaintPreliminarySearch] = useState<{ status: string; checkCount: number; foundCount: number; note: string } | null>(null);
  const [complaintError, setComplaintError] = useState('');

  // Tracking State
  const [trackTokenInput, setTrackTokenInput] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [trackingResult, setTrackingResult] = useState<TrackingResult | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setSearchError('กรุณากรอกคำค้นหาอย่างน้อย 2 ตัวอักษร');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);
    setAiSummary('');
    try {
      const params = new URLSearchParams({ q: normalizedQuery, category });
      const res = await fetch(`/api/v1/public/search?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'ค้นหาข้อมูลไม่สำเร็จ');
      }
      setSearchResults(Array.isArray(body.data?.results) ? body.data.results : []);
      setAiSummary(typeof body.data?.aiSummary === 'string' ? body.data.aiSummary : '');
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'ค้นหาข้อมูลไม่สำเร็จ');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setFileError('ขนาดไฟล์เกินกำหนด (สูงสุด 20 MB)');
      return;
    }

    const validExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !validExtensions.includes(ext)) {
      setFileError('รองรับเฉพาะไฟล์รูปภาพ (PNG, JPG) หรือเอกสาร PDF');
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setFileError('');
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingComplaint(true);
    setComplaintError('');
    try {
      const formData = new FormData();
      formData.set('topic', topic.trim());
      formData.set('description', description.trim());
      formData.set('category', complaintCategory);
      if (region.trim()) formData.set('region', region.trim());
      if (!isAnonymous && complainantName.trim()) formData.set('complainantName', complainantName.trim());
      if (!isAnonymous && complainantContact.trim()) formData.set('complainantContact', complainantContact.trim());
      const detailFields = { incidentDate, incidentTime, incidentLocation, productName, registrationNumber, businessName, businessAddress, purchaseDetails, desiredAction };
      for (const [key, value] of Object.entries(detailFields)) if (value.trim()) formData.set(key, value.trim());
      formData.set('isAnonymous', String(isAnonymous));
      if (selectedFile) {
        formData.set('file', selectedFile, selectedFile.name);
      }

      const res = await fetch('/api/v1/public/complaints', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'บันทึกคำร้องไม่สำเร็จ');
      setComplaintSuccessToken(body.data.trackingToken);
      setComplaintValidationStatus(typeof body.data.attachmentValidationStatus === 'string' ? body.data.attachmentValidationStatus : null);
      setComplaintPreliminarySearch(body.data.preliminarySearch && typeof body.data.preliminarySearch === 'object' ? body.data.preliminarySearch : null);
      setTopic('');
      setDescription('');
      setComplainantName('');
      setComplainantContact('');
      setIncidentDate(''); setIncidentTime(''); setIncidentLocation(''); setProductName(''); setRegistrationNumber('');
      setBusinessName(''); setBusinessAddress(''); setPurchaseDetails(''); setDesiredAction('');
      handleRemoveFile();
    } catch (err: unknown) {
      setComplaintError(err instanceof Error ? err.message : 'บันทึกคำร้องไม่สำเร็จ');
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackTokenInput.trim()) {
      setTrackError('กรุณากรอกรหัสติดตามเรื่อง');
      return;
    }
    setIsTracking(true);
    setTrackError('');
    setTrackingResult(null);
    try {
      const res = await fetch(`/api/v1/public/track/${encodeURIComponent(trackTokenInput.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'ไม่พบข้อมูลคำร้อง');
      setTrackingResult(body.data);
    } catch (err: unknown) {
      setTrackError(err instanceof Error ? err.message : 'ไม่พบข้อมูลคำร้อง');
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-teal-400/30">
      {/* Top Navbar */}
      <header className="border-b border-white/[0.08] bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-400 p-0.5 shadow-[0_0_15px_rgba(45,212,191,0.3)]">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-teal-300" />
              </div>
            </div>
            <div>
              <span className="text-base font-black tracking-tight text-white">
                LAWiRISK <span className="text-teal-300 font-medium text-xs ml-1">CITIZEN PORTAL</span>
              </span>
              <p className="text-[10px] text-slate-400 -mt-0.5">ศูนย์ตรวจสอบและแจ้งเบาะแสดิจิทัลสาธารณะ</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-xs font-semibold text-slate-300 hover:text-white hover:border-teal-400/40 transition"
            >
              <Lock className="w-3.5 h-3.5 text-teal-300" />
              <span>เข้าสู่ระบบเจ้าหน้าที่ (Staff)</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="relative overflow-hidden pt-12 pb-8 border-b border-white/[0.05]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 text-center space-y-4 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-400/10 px-3.5 py-1 text-xs font-bold text-teal-200">
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            <span>ระบบบริการข้อมูลและรับแจ้งเบาะแสประชาชน (Public Service Portal)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            ตรวจสอบข้อมูลความปลอดภัยและแจ้งเบาะแสดิจิทัล
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            ค้นทะเบียนผลิตภัณฑ์จาก อย. และตรวจสถานประกอบการเพื่อสุขภาพจาก สบส. พร้อมรายละเอียดสถานะจากต้นทาง
          </p>

          {/* Navigation Tabs */}
          <div className="flex justify-center gap-2 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab('SEARCH')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'SEARCH'
                  ? 'bg-teal-400 text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.3)]'
                  : 'border border-white/[0.08] bg-slate-900/50 text-slate-400 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
              ตรวจสอบทะเบียนทางการ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('COMPLAINT')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'COMPLAINT'
                  ? 'bg-teal-400 text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.3)]'
                  : 'border border-white/[0.08] bg-slate-900/50 text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              แจ้งเรื่องร้องเรียน / เบาะแส
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TRACK')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'TRACK'
                  ? 'bg-teal-400 text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.3)]'
                  : 'border border-white/[0.08] bg-slate-900/50 text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4" />
              ติดตามสถานะเรื่องร้องเรียน
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* TAB 1: OPEN DATA SEARCH */}
        {activeTab === 'SEARCH' && (
          <div className="space-y-6">
            <form onSubmit={handleSearch} className="hud-panel rounded-3xl p-6 sm:p-8 space-y-4 border border-white/[0.08]">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    aria-label="คำค้นหาข้อมูลสาธารณะ"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="เลข อย./ชื่อผลิตภัณฑ์ หรือชื่อคลินิก/ร้านนวด/สปา..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-white/[0.1] rounded-2xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SearchCategory)}
                  className="bg-slate-950 border border-white/[0.1] rounded-2xl px-4 py-3 text-xs text-white"
                >
                  <option value="ALL">เลือกแหล่งให้อัตโนมัติ</option>
                  <option value="HEALTH_PRODUCTS">ผลิตภัณฑ์สุขภาพ — อย.</option>
                  <option value="HEALTH_SERVICES">คลินิก / ร้านนวด / สปา — สบส.</option>
                  <option value="FRAUD_ALERTS">เตือนภัยออนไลน์ / บัญชีม้า</option>
                  <option value="COMPANIES">นิติบุคคล / บริษัท</option>
                  <option value="LICENSES">เลขทะเบียน / ใบอนุญาต — อย.</option>
                </select>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="primary-action px-6 py-3 rounded-2xl text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-2 shrink-0"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  ค้นหาข้อมูล
                </button>
              </div>

              {searchError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  {searchError}
                </div>
              )}
            </form>

            {/* Official source summary */}
            {aiSummary && (
              <div className="hud-panel rounded-3xl p-6 border border-teal-300/30 bg-teal-950/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
                  <Sparkles className="w-4 h-4 text-teal-300" />
                  <span>สรุปผลจากทะเบียนทางการ</span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {aiSummary}
                </p>
              </div>
            )}

            {/* Search Results List */}
            {searchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  ผลการค้นหาจากฐานข้อมูลทางการ ({searchResults.length} รายการ)
                </h3>
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-white/[0.1] bg-slate-900/60 p-6 space-y-4 hover:border-teal-400/50 shadow-lg transition"
                  >
                    {/* Top Category & Status Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-400/10 border border-teal-300/30 text-xs font-bold text-teal-200">
                        <span>🏷️ หมวดหมู่:</span>
                        <span className="text-white font-extrabold">{item.category === 'HEALTH_SERVICES' ? 'บริการสุขภาพ — สบส.' : item.productCategoryLabel || 'ผลิตภัณฑ์สุขภาพ — อย.'}</span>
                      </div>
                      <span
                        className={`text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                            item.status === 'WARNING' || item.status === 'REVOKED' || item.status === 'UNAVAILABLE'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : item.status === 'UNREGISTERED'
                                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        }`}
                      >
                        ● {item.status === 'SAFE'
                          ? 'พบในทะเบียนและสถานะใช้งาน'
                          : item.status === 'UNREGISTERED'
                            ? 'ไม่พบรายการที่ตรงกัน'
                            : item.status === 'UNAVAILABLE'
                              ? 'ต้นทางไม่พร้อมใช้งาน'
                              : item.status === 'REVOKED'
                                ? 'ยกเลิก/เพิกถอน/สิ้นอายุ'
                                : 'พบรายการที่ต้องตรวจสอบสถานะ'}
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      <h4 className="text-base font-black text-white leading-snug">
                        {item.title}
                      </h4>
                    </div>

                    {/* Snippet / Details */}
                    <div className="p-3.5 bg-slate-950/70 border border-white/[0.05] rounded-2xl text-xs text-slate-200 leading-relaxed font-mono">
                      {item.snippet}
                    </div>

                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08]">
                        {Object.entries(item.metadata).map(([label, value]) => (
                          <div key={label} className="bg-slate-950/90 p-3.5">
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                            <dd className="mt-1 text-xs leading-relaxed text-slate-100 break-words">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {/* Source & Citation Footer */}
                    <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>แหล่งข้อมูลทางการ: <strong className="text-teal-300">{item.source}</strong></span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-400/30 bg-teal-400/10 text-xs font-bold text-teal-200 hover:bg-teal-400/20 transition"
                      >
                        ตรวจสอบข้อมูลต้นฉบับ <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CITIZEN COMPLAINT FORM */}
        {activeTab === 'COMPLAINT' && (
          <div className="space-y-6">
            {complaintSuccessToken ? (
              <div className="hud-panel rounded-3xl p-8 border border-emerald-500/40 bg-emerald-950/20 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-400/50 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-300" />
                </div>
                <h3 className="text-xl font-bold text-white">บันทึกเรื่องร้องเรียนเรียบร้อยแล้ว</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  {complaintValidationStatus === 'VALIDATED'
                    ? 'รับข้อมูล จัดเก็บไฟล์ในคลังส่วนตัว และตรวจรูปแบบไฟล์แล้ว'
                    : complaintValidationStatus
                      ? `รับข้อมูลและจัดเก็บไฟล์แล้ว สถานะการตรวจไฟล์คือ ${complaintValidationStatus}`
                      : 'รับข้อมูลคำร้องเข้าสู่ระบบแล้ว เจ้าหน้าที่จะดำเนินการคัดกรองตามขั้นตอนต่อไป'}
                </p>
                <div className="p-4 bg-slate-950 border border-white/[0.1] rounded-2xl inline-block">
                  <span className="text-[10px] text-slate-500 uppercase block">รหัสติดตามเรื่องของคุณ (Tracking Token)</span>
                  <span className="text-xl font-mono font-black text-teal-300 select-all">{complaintSuccessToken}</span>
                </div>
                {complaintPreliminarySearch && (
                  <div className="mx-auto max-w-xl rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4 text-left">
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-200"><Sparkles className="h-4 w-4" />ระบบตรวจฐานข้อมูลเบื้องต้นให้แล้ว</div>
                    <p className="mt-2 text-xs leading-6 text-slate-300">{complaintPreliminarySearch.note}</p>
                    <p className="mt-2 font-mono text-[10px] text-cyan-300/70">ตรวจ {complaintPreliminarySearch.checkCount} ฐาน · พบผลที่ต้องให้เจ้าหน้าที่ตรวจทาน {complaintPreliminarySearch.foundCount} ฐาน</p>
                  </div>
                )}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComplaintSuccessToken('');
                      setComplaintValidationStatus(null);
                      setComplaintPreliminarySearch(null);
                      setActiveTab('TRACK');
                      setTrackTokenInput(complaintSuccessToken);
                    }}
                    className="primary-action px-6 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    ไปที่หน้าติดตามสถานะ
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleComplaintSubmit} className="hud-panel rounded-3xl p-6 sm:p-8 space-y-5 border border-white/[0.08]">
                <div className="border-b border-white/[0.08] pb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-300" />
                    แบบฟอร์มแจ้งเรื่องร้องเรียน / เบาะแสประชาชน
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    ข้อมูลของท่านจะถูกจัดเก็บอย่างปลอดภัยตามมาตรฐาน พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
                  </p>
                </div>

                {complaintError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                    {complaintError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="complaint-category" className="block text-xs font-semibold text-slate-300 mb-1">
                      ประเภทเรื่องร้องเรียน <span className="text-rose-400">*</span>
                    </label>
                    <select
                      id="complaint-category"
                      value={complaintCategory}
                      onChange={(e) => setComplaintCategory(e.target.value as 'HEALTH_HAZARD' | 'ONLINE_FRAUD' | 'ILLEGAL_CLINIC' | 'OTHER')}
                      className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                    >
                      <option value="ONLINE_FRAUD">หลอกลวงออนไลน์ / ฉ้อโกง / บัญชีม้า</option>
                      <option value="HEALTH_HAZARD">ผลิตภัณฑ์สุขภาพ / ยา / อาหารปลอมแปลง</option>
                      <option value="ILLEGAL_CLINIC">สถานพยาบาล / คลินิกเถื่อน</option>
                      <option value="OTHER">อื่นๆ</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="complaint-topic" className="block text-xs font-semibold text-slate-300 mb-1">
                      หัวข้อเรื่องร้องเรียน <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id="complaint-topic"
                      type="text"
                      required
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="เช่น ถูกเพจหลอกขายสินค้าโอนเงินแล้วบล็อกหนี..."
                      className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="complaint-description" className="block text-xs font-semibold text-slate-300 mb-1">
                      รายละเอียดพฤติการณ์ / ข้อมูลเบาะแส <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      id="complaint-description"
                      required
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="ระบุข้อความแชต เลขบัญชีคนร้าย เบอร์โทรศัพท์ หรือลิงก์เพจที่เกี่ยวข้อง..."
                      className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="complaint-region" className="block text-xs font-semibold text-slate-300 mb-1">
                        พื้นที่เกิดเหตุ / จังหวัด
                      </label>
                      <input
                        id="complaint-region"
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        placeholder="เช่น ศรีสะเกษ, อุบลราชธานี"
                        className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                      />
                    </div>

                    <div className="flex items-center pt-6">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={isAnonymous}
                          onChange={(e) => setIsAnonymous(e.target.checked)}
                          className="rounded border-slate-800 text-teal-400 focus:ring-0"
                        />
                        <span>ไม่ประสงค์ออกนาม (Anonymous Complaint)</span>
                      </label>
                    </div>
                  </div>

                  <details className="rounded-2xl border border-teal-400/20 bg-teal-950/10 p-4 open:bg-teal-950/20">
                    <summary className="cursor-pointer text-xs font-bold text-teal-200">
                      เพิ่มรายละเอียดเพื่อค้นฐานข้อมูลอัตโนมัติและจัดทำรายงานให้ครบถ้วน
                    </summary>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">เลขทะเบียน ชื่อผลิตภัณฑ์ และชื่อกิจการจะช่วยให้ระบบเลือกฐาน อย./สบส. ได้ตรงประเภท ข้อมูลที่ไม่ทราบเว้นว่างได้</p>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="text-xs text-slate-300">วันที่เกิดเหตุ
                        <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300">เวลาเกิดเหตุ
                        <input type="time" value={incidentTime} onChange={(e) => setIncidentTime(e.target.value)} className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300 sm:col-span-2">สถานที่เกิดเหตุ
                        <input value={incidentLocation} onChange={(e) => setIncidentLocation(e.target.value)} placeholder="ชื่อสถานที่ บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300">ชื่อผลิตภัณฑ์
                        <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="ชื่อบนฉลากหรือชื่อสินค้า" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300">เลขทะเบียน / เลขสารบบ / เลขใบอนุญาต
                        <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="เช่น 2A972/29 หรือ 74-2-01859-6-0457" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 font-mono text-white" />
                      </label>
                      <label className="text-xs text-slate-300">ชื่อกิจการ / สถานประกอบการ
                        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="ชื่อร้าน โรงงาน คลินิก หรือผู้ผลิต" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300">ที่อยู่กิจการ / เป้าหมาย
                        <input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="ที่อยู่ที่ต้องการให้ตรวจสอบ" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300 sm:col-span-2">รายละเอียดการซื้อหรือการพบเหตุ
                        <textarea rows={2} value={purchaseDetails} onChange={(e) => setPurchaseDetails(e.target.value)} placeholder="วันเวลา จำนวน ราคา ช่องทางซื้อ ผู้ขาย หรือรุ่นผลิต" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                      <label className="text-xs text-slate-300 sm:col-span-2">ต้องการให้เจ้าหน้าที่ดำเนินการอย่างไร
                        <textarea rows={2} value={desiredAction} onChange={(e) => setDesiredAction(e.target.value)} placeholder="เช่น ตรวจสถานที่ ตรวจทะเบียน เก็บตัวอย่าง หรือแจ้งผล" className="mt-1 w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-white" />
                      </label>
                    </div>
                  </details>

                  {!isAnonymous && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/[0.05]">
                      <div>
                        <label htmlFor="complainant-name" className="block text-xs font-semibold text-slate-300 mb-1">
                          ชื่อ-นามสกุล ผู้แจ้ง
                        </label>
                        <input
                          id="complainant-name"
                          type="text"
                          value={complainantName}
                          onChange={(e) => setComplainantName(e.target.value)}
                          placeholder="นายสมชาย ใจดี"
                          className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="complainant-contact" className="block text-xs font-semibold text-slate-300 mb-1">
                          เบอร์โทรศัพท์ / อีเมลติดต่อกลับ
                        </label>
                        <input
                          id="complainant-contact"
                          type="text"
                          value={complainantContact}
                          onChange={(e) => setComplainantContact(e.target.value)}
                          placeholder="081-234-5678"
                          className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* File Attachment Section */}
                  <div className="pt-3 border-t border-white/[0.05]">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-teal-300" />
                      <span>แนบไฟล์หลักฐาน (ภาพแคปหน้าจอ / สลิปโอนเงิน / เอกสาร PDF)</span>
                      <span className="text-[10px] text-slate-500 font-normal ml-auto">รองรับ PNG, JPG, PDF ไม่เกิน 20 MB</span>
                    </label>

                    {fileError && (
                      <div className="mb-2 p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                        {fileError}
                      </div>
                    )}

                    {!selectedFile ? (
                      <label className="group relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-white/[0.1] hover:border-teal-400/50 rounded-2xl bg-slate-950/60 hover:bg-teal-950/10 cursor-pointer transition">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.pdf"
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="w-10 h-10 rounded-xl bg-teal-400/10 flex items-center justify-center text-teal-300 mb-2 group-hover:scale-110 transition">
                          <Upload className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium text-slate-300 text-center">
                          คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          ภาพถ่ายสินค้า, แคปหน้าจอแชต, ซองยา, หรือสลิปธนาคาร
                        </p>
                      </label>
                    ) : (
                      <div className="flex items-center justify-between p-3.5 rounded-2xl border border-teal-500/30 bg-teal-950/20">
                        <div className="flex items-center gap-3 min-w-0">
                          {filePreview ? (
                            <Image
                              src={filePreview}
                              alt="ตัวอย่างไฟล์แนบ"
                              width={48}
                              height={48}
                              unoptimized
                              className="w-12 h-12 rounded-xl object-cover border border-white/[0.1] shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-teal-400/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{selectedFile.name}</p>
                            <p className="text-[10px] text-teal-300/80 mt-0.5 font-mono">
                              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'เอกสาร'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="p-1.5 rounded-xl border border-white/[0.1] bg-slate-900 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 transition shrink-0 cursor-pointer ml-2"
                          title="ลบไฟล์"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.08] flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingComplaint}
                    className="primary-action px-8 py-3 rounded-2xl text-xs font-bold shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    {isSubmittingComplaint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    ส่งเรื่องร้องเรียน
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: TRACK STATUS */}
        {activeTab === 'TRACK' && (
          <div className="space-y-6">
            <form onSubmit={handleTrack} className="hud-panel rounded-3xl p-6 sm:p-8 space-y-4 border border-white/[0.08]">
              <div className="border-b border-white/[0.08] pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Compass className="w-5 h-5 text-teal-300" />
                  ตรวจสอบสถานะคำร้องด้วย Tracking Token
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  กรอกรหัสติดตามเรื่องที่ท่านได้รับเพื่อดูขั้นตอนการดำเนินงานของเจ้าหน้าที่
                </p>
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  aria-label="รหัสติดตามเรื่อง"
                  required
                  value={trackTokenInput}
                  onChange={(e) => setTrackTokenInput(e.target.value)}
                  placeholder="เช่น TRK-2026-AB12CD"
                  className="flex-1 px-4 py-3 bg-slate-950 border border-white/[0.1] rounded-2xl text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-400 uppercase"
                />
                <button
                  type="submit"
                  disabled={isTracking}
                  className="primary-action px-6 py-3 rounded-2xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-2 shrink-0"
                >
                  {isTracking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  ตรวจสอบ
                </button>
              </div>

              {trackError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  {trackError}
                </div>
              )}
            </form>

            {/* Tracking Result Card */}
            {trackingResult && (
              <div className="hud-panel rounded-3xl p-6 sm:p-8 border border-teal-300/30 bg-slate-900/50 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">TRACKING TOKEN</span>
                    <h3 className="text-lg font-mono font-bold text-teal-300">{trackingResult.trackingToken}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">วันที่ยื่นเรื่อง</span>
                    <span className="text-xs text-slate-300">{new Date(trackingResult.receivedAt).toLocaleDateString('th-TH')}</span>
                  </div>
                </div>

                {/* Progress Steps */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className={`p-3 rounded-xl border ${trackingResult.progressStep >= 1 ? 'border-teal-400 bg-teal-950/40 text-teal-300 font-bold' : 'border-white/[0.05] text-slate-600'}`}>
                    1. รับเรื่องในระบบ
                  </div>
                  <div className={`p-3 rounded-xl border ${trackingResult.progressStep >= 2 ? 'border-teal-400 bg-teal-950/40 text-teal-300 font-bold' : 'border-white/[0.05] text-slate-600'}`}>
                    2. ตรวจไฟล์ & คัดกรอง
                  </div>
                  <div className={`p-3 rounded-xl border ${trackingResult.progressStep >= 3 ? 'border-teal-400 bg-teal-950/40 text-teal-300 font-bold' : 'border-white/[0.05] text-slate-600'}`}>
                    3. บรรจุเข้าสำนวนคดี
                  </div>
                </div>

                <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/[0.08] flex items-center gap-3">
                  <Clock className="w-5 h-5 text-teal-300 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">สถานะปัจจุบัน</span>
                    <span className="text-sm font-bold text-white">{trackingResult.statusLabel}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
