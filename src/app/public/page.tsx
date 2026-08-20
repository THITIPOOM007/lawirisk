'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

interface SearchResultItem {
  id: string;
  title: string;
  category: string;
  snippet: string;
  source: string;
  sourceUrl: string;
  publishedDate: string;
  confidenceScore: number;
  status: 'SAFE' | 'WARNING' | 'REVOKED' | 'UNREGISTERED';
}

export default function PublicPortalPage() {
  const [activeTab, setActiveTab] = useState<'SEARCH' | 'COMPLAINT' | 'TRACK'>('SEARCH');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('ALL');
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
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [complaintSuccessToken, setComplaintSuccessToken] = useState('');
  const [complaintError, setComplaintError] = useState('');

  // Tracking State
  const [trackTokenInput, setTrackTokenInput] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [trackingResult, setTrackingResult] = useState<{
    trackingToken: string;
    receivedAt: string;
    statusLabel: string;
    progressStep: number;
    jurisdiction: string;
  } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) {
      setSearchError('กรุณากรอกคำค้นหาอย่างน้อย 2 ตัวอักษร');
      return;
    }
    setIsSearching(true);
    setSearchError('');
    try {
      const res = await fetch(
        `/api/v1/public/search?q=${encodeURIComponent(searchQuery.trim())}&category=${encodeURIComponent(category)}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'ค้นหาข้อมูลไม่สำเร็จ');
      setSearchResults(body.data.results);
      setAiSummary(body.data.aiSummary);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'ค้นหาข้อมูลไม่สำเร็จ');
    } finally {
      setIsSearching(false);
    }
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingComplaint(true);
    setComplaintError('');
    try {
      const res = await fetch('/api/v1/public/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          description: description.trim(),
          category: complaintCategory,
          region: region.trim() || undefined,
          complainantName: isAnonymous ? undefined : complainantName.trim() || undefined,
          complainantContact: isAnonymous ? undefined : complainantContact.trim() || undefined,
          isAnonymous,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'บันทึกคำร้องไม่สำเร็จ');
      setComplaintSuccessToken(body.data.trackingToken);
      setTopic('');
      setDescription('');
      setComplainantName('');
      setComplainantContact('');
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
      if (!res.ok) throw new Error(body.error || 'ไม่พบข้อมูลคำร้อง');
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
            <span>Open Data & AI-Assisted Citizen Service</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            ตรวจสอบข้อมูลเตือนภัย & แจ้งเบาะแสอาชญากรรม
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            ค้นหาข้อมูลผลิตภัณฑ์ที่ไม่ปลอดภัย บัญชีม้า และยื่นเบาะแสคำร้องทุกข์ออนไลน์โดยตรง พร้อมติดตามสถานะด้วยระบบความปลอดภัย
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
              ค้นหา Open Data เตือนภัย
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
              ติดตามสถานะคำร้อง
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="พิมพ์ชื่อผลิตภัณฑ์, ยี่ห้อ, เลข อย., หรือชื่อบุคคล/เพจที่สงสัย..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-white/[0.1] rounded-2xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-slate-950 border border-white/[0.1] rounded-2xl px-4 py-3 text-xs text-white"
                >
                  <option value="ALL">ทุกหมวดหมู่</option>
                  <option value="HEALTH_PRODUCTS">ผลิตภัณฑ์สุขภาพ / ยา</option>
                  <option value="FRAUD_ALERTS">เตือนภัยออนไลน์ / บัญชีม้า</option>
                  <option value="COMPANIES">สถานพยาบาล / คลินิก</option>
                  <option value="LICENSES">ใบอนุญาต / อย.</option>
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

            {/* AI Citation Summary Box */}
            {aiSummary && (
              <div className="hud-panel rounded-3xl p-6 border border-teal-300/30 bg-teal-950/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
                  <Sparkles className="w-4 h-4 text-teal-300 animate-pulse" />
                  <span>AI SYNTHESIS & CITATION SUMMARY</span>
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
                        <span className="text-white font-extrabold">{item.title.split(']')[0]?.replace('[', '') || 'ผลิตภัณฑ์สุขภาพ'}</span>
                      </div>
                      <span
                        className={`text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                          item.status === 'WARNING' || item.status === 'REVOKED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        }`}
                      >
                        ● {item.status === 'SAFE' ? 'ถูกต้องตามกฎหมาย (SAFE)' : item.status}
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
                  ข้อมูลและหลักฐานของคุณถูกนำเข้าสู่ระบบคลังนิรภัยเพื่อสแกนมัลแวร์และคัดกรองความปลอดภัยเรียบร้อยแล้ว
                </p>
                <div className="p-4 bg-slate-950 border border-white/[0.1] rounded-2xl inline-block">
                  <span className="text-[10px] text-slate-500 uppercase block">รหัสติดตามเรื่องของคุณ (Tracking Token)</span>
                  <span className="text-xl font-mono font-black text-teal-300 select-all">{complaintSuccessToken}</span>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComplaintSuccessToken('');
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      ประเภทเรื่องร้องเรียน <span className="text-rose-400">*</span>
                    </label>
                    <select
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      หัวข้อเรื่องร้องเรียน <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="เช่น ถูกเพจหลอกขายสินค้าโอนเงินแล้วบล็อกหนี..."
                      className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      รายละเอียดพฤติการณ์ / ข้อมูลเบาะแส <span className="text-rose-400">*</span>
                    </label>
                    <textarea
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
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        พื้นที่เกิดเหตุ / จังหวัด
                      </label>
                      <input
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

                  {!isAnonymous && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/[0.05]">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          ชื่อ-นามสกุล ผู้แจ้ง
                        </label>
                        <input
                          type="text"
                          value={complainantName}
                          onChange={(e) => setComplainantName(e.target.value)}
                          placeholder="นายสมชาย ใจดี"
                          className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          เบอร์โทรศัพท์ / อีเมลติดต่อกลับ
                        </label>
                        <input
                          type="text"
                          value={complainantContact}
                          onChange={(e) => setComplainantContact(e.target.value)}
                          placeholder="081-234-5678"
                          className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-3 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
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
                    2. สแกน & คัดกรอง
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
