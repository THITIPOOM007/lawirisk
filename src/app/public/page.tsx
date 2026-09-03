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
  Paperclip,
  Upload,
  X,
  ArrowRight,
  BadgeCheck,
  Database,
  Fingerprint,
  MousePointerClick,
  Radio,
  ScanLine,
  Camera,
  Waypoints,
} from 'lucide-react';
import SatisfactionSurvey from '@/components/SatisfactionSurvey';
import PublicProductScanner from '@/components/PublicProductScanner';

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

type SearchCategory = 'ALL' | 'HEALTH_PRODUCTS' | 'HEALTH_SERVICES' | 'CLINICS' | 'MASSAGE_SPA' | 'FRAUD_ALERTS' | 'COMPANIES' | 'LICENSES';

const thaiProvinces = ['กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระบุรี', 'สระแก้ว', 'สิงห์บุรี', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'สุโขทัย', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี'];
const healthRegions = ['ทั่วประเทศ', 'ภาคเหนือ', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคกลาง', 'ภาคตะวันออก', 'ภาคตะวันตก', 'ภาคใต้', 'กรุงเทพมหานครและปริมณฑล'];

const publicServices = [
  {
    id: 'SEARCH' as const,
    label: 'ตรวจสอบข้อมูล',
    fullLabel: 'ตรวจสอบทะเบียนทางการ',
    description: 'ค้นผลิตภัณฑ์ คลินิก และใบอนุญาตจากแหล่งข้อมูลต้นทาง',
    icon: Search,
  },
  {
    id: 'SCAN' as const,
    label: 'สแกนสินค้า',
    fullLabel: 'สแกนภาพสินค้าที่สงสัย',
    description: 'อ่านฉลาก จุดผิดสังเกต และข้อมูลที่ควรนำไปตรวจสอบต่อ',
    icon: ScanLine,
  },
  {
    id: 'COMPLAINT' as const,
    label: 'แจ้งเบาะแส',
    fullLabel: 'แจ้งเรื่องร้องเรียน / เบาะแส',
    description: 'ส่งรายละเอียดและหลักฐานเข้าสู่กระบวนการตรวจสอบอย่างปลอดภัย',
    icon: FileText,
  },
  {
    id: 'TRACK' as const,
    label: 'ติดตามเรื่อง',
    fullLabel: 'ติดตามสถานะเรื่องร้องเรียน',
    description: 'ใช้รหัสที่ได้รับเพื่อตรวจความคืบหน้าได้ทุกเวลา',
    icon: Compass,
  },
];

const quickStartSteps = [
  {
    step: '01',
    title: 'เลือกบริการที่ต้องการ',
    description: 'ค้นทะเบียน สแกนภาพ แจ้งเบาะแส หรือติดตามเรื่องได้จากหน้าเดียว',
    icon: MousePointerClick,
    color: 'text-cyan-200',
    surface: 'border-cyan-300/20 bg-cyan-300/[0.07]',
  },
  {
    step: '02',
    title: 'กรอกข้อมูลเท่าที่มี',
    description: 'ใช้ชื่อ เลขทะเบียน รายละเอียดเหตุการณ์ หรือรหัสติดตาม',
    icon: Fingerprint,
    color: 'text-violet-200',
    surface: 'border-violet-300/20 bg-violet-300/[0.07]',
  },
  {
    step: '03',
    title: 'รับผลที่ตรวจสอบต่อได้',
    description: 'เปิดแหล่งข้อมูลต้นฉบับ หรือเก็บรหัสไว้ติดตามความคืบหน้า',
    icon: BadgeCheck,
    color: 'text-amber-200',
    surface: 'border-amber-300/20 bg-amber-300/[0.07]',
  },
];

export default function PublicPortalPage() {
  const [activeTab, setActiveTab] = useState<'SEARCH' | 'SCAN' | 'COMPLAINT' | 'TRACK'>('SEARCH');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('ALL');
  const [searchProvince, setSearchProvince] = useState('');
  const [searchHealthRegion, setSearchHealthRegion] = useState('ทั่วประเทศ');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [searchSurveyId, setSearchSurveyId] = useState('');

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [complaintSuccessToken, setComplaintSuccessToken] = useState('');
  const [complaintValidationStatus, setComplaintValidationStatus] = useState<string | null>(null);
  const [complaintPreliminarySearch, setComplaintPreliminarySearch] = useState<{ status: string; checkCount: number; foundCount: number; note: string } | null>(null);
  const [complaintError, setComplaintError] = useState('');
  const [complaintSurveyId, setComplaintSurveyId] = useState('');

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
      if (searchProvince.trim()) params.set('province', searchProvince.trim());
      if (searchHealthRegion !== 'ทั่วประเทศ') params.set('healthRegion', searchHealthRegion);
      const res = await fetch(`/api/v1/public/search?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'ค้นหาข้อมูลไม่สำเร็จ');
      }
      setSearchResults(Array.isArray(body.data?.results) ? body.data.results : []);
      setAiSummary(typeof body.data?.aiSummary === 'string' ? body.data.aiSummary : '');
      setSearchSurveyId(crypto.randomUUID());
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'ค้นหาข้อมูลไม่สำเร็จ');
    } finally {
      setIsSearching(false);
    }
  };

  const prefillComplaintFromSearch = (item: SearchResultItem) => {
    const metadata = item.metadata || {};
    const businessResult = item.category === 'CLINICS' || item.category === 'MASSAGE_SPA';
    const location = metadata['ที่ตั้ง'] || '';
    const province = metadata['จังหวัด'] || searchProvince;
    const registration = metadata['เลขที่ใบอนุญาต'] || metadata['เลขใบสำคัญ/ใบอนุญาต'] || '';
    setComplaintCategory(businessResult ? 'ILLEGAL_CLINIC' : 'HEALTH_HAZARD');
    setTopic(`ขอให้ตรวจสอบ: ${item.title}`);
    setDescription(`ผู้แจ้งเลือกส่งต่อข้อมูลจากการค้นหาเพื่อขอให้เจ้าหน้าที่ตรวจสอบ\n\nรายการ: ${item.title}\nแหล่งข้อมูล: ${item.source}\nลิงก์ต้นฉบับ: ${item.sourceUrl}\nข้อมูลที่แสดง: ${item.snippet}\n\nข้อมูลนี้เป็นผลค้นหาหรือข่าวที่เกี่ยวข้อง ไม่ใช่ข้อสรุปว่ามีการกระทำผิด`);
    if (businessResult) {
      setBusinessName(item.title);
      setBusinessAddress(location);
    } else {
      setProductName(item.title);
    }
    setRegistrationNumber(registration);
    setRegion([province, searchHealthRegion !== 'ทั่วประเทศ' ? searchHealthRegion : ''].filter(Boolean).join(' · '));
    setActiveTab('COMPLAINT');
    window.setTimeout(() => document.getElementById('public-service-panel-complaint')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setFileError('');
    if (!files.length) return;

    if (files.length > 5) {
      setFileError('แนบได้สูงสุด 5 ไฟล์ต่อเรื่องร้องเรียน');
      return;
    }
    const validExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
    if (files.some((file) => file.size <= 0 || file.size > 20 * 1024 * 1024)) {
      setFileError('แต่ละไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MB');
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) {
      setFileError('ขนาดรวมของไฟล์ทั้งหมดต้องไม่เกิน 50 MB');
      return;
    }
    if (files.some((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return !ext || !validExtensions.includes(ext);
    })) {
      setFileError('รองรับเฉพาะไฟล์รูปภาพ (PNG, JPG) หรือเอกสาร PDF');
      return;
    }
    setSelectedFiles(files);
  };

  const handleRemoveFile = (index?: number) => {
    setSelectedFiles((current) => typeof index === 'number' ? current.filter((_, itemIndex) => itemIndex !== index) : []);
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
      for (const file of selectedFiles) formData.append('files', file, file.name);

      const res = await fetch('/api/v1/public/complaints', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'บันทึกคำร้องไม่สำเร็จ');
      setComplaintSuccessToken(body.data.trackingToken);
      setComplaintSurveyId(crypto.randomUUID());
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

  const activateService = (service: 'SEARCH' | 'SCAN' | 'COMPLAINT' | 'TRACK', shouldScroll = false) => {
    setActiveTab(service);
    if (shouldScroll) {
      window.requestAnimationFrame(() => {
        document.getElementById('public-service-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020817] font-sans text-slate-100 selection:bg-cyan-300/30">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute -left-36 top-16 h-[430px] w-[430px] rounded-full bg-cyan-500/[0.12] blur-[110px]" />
        <div className="absolute -right-40 top-[28rem] h-[520px] w-[520px] rounded-full bg-violet-500/[0.11] blur-[130px]" />
        <div className="absolute bottom-[-12rem] left-1/3 h-[480px] w-[480px] rounded-full bg-amber-400/[0.07] blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(103,232,249,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.12)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_68%)]" />
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#020817]/75 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-[72px] sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-300 via-teal-300 to-violet-400 p-px shadow-[0_0_26px_rgba(34,211,238,0.26)]">
              <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-[#05101f]">
                <ShieldCheck className="h-5 w-5 text-cyan-200" />
              </div>
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#020817] bg-emerald-300" />
            </div>
            <div>
              <span className="text-sm font-black tracking-tight text-white sm:text-base">
                LAWiRISK <span className="ml-1 text-[10px] font-bold tracking-[0.12em] text-cyan-300 sm:text-xs">CITIZEN</span>
              </span>
              <p className="-mt-0.5 hidden text-[10px] text-slate-500 sm:block">บริการตรวจสอบและแจ้งเบาะแสสำหรับประชาชน</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-[11px] font-bold text-slate-300 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:px-4 sm:text-xs"
            >
              <Lock className="h-3.5 w-3.5 text-cyan-300" />
              <span className="sm:hidden">เจ้าหน้าที่</span>
              <span className="hidden sm:inline">เข้าสู่ระบบเจ้าหน้าที่</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="relative z-10 overflow-hidden pb-10 pt-9 sm:pb-12 sm:pt-11 lg:pb-14 lg:pt-12">
        <div className="mx-auto grid max-w-7xl items-center gap-9 px-4 sm:px-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-3.5 py-1.5 text-[10px] font-black tracking-[0.12em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.08)] sm:text-xs">
              <Radio className="h-3.5 w-3.5 text-emerald-300" />
              เชื่อมต่อข้อมูลต้นทาง · พร้อมให้บริการ
            </div>
            <h1 className="mt-5 text-balance text-[2.15rem] font-black leading-[1.12] tracking-[-0.04em] text-white sm:text-[2.75rem] lg:text-[3.15rem]">
              ตรวจสอบก่อนตัดสินใจ
              <span className="mt-1 block bg-gradient-to-r from-cyan-200 via-emerald-200 to-violet-300 bg-clip-text text-transparent">ค้นทะเบียน · สแกนสินค้า</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-[15px]">
              ค้นข้อมูลจากแหล่งทางการหรือถ่ายภาพสินค้าที่สงสัย เพื่ออ่านฉลาก ชี้จุดที่ควรตรวจเพิ่ม แจ้งเบาะแสพร้อมหลักฐาน และติดตามเรื่องได้ในหน้าเดียว
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => activateService('SEARCH', true)}
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_12px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(34,211,238,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 motion-reduce:transform-none"
              >
                ค้นข้อมูลทางการ <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </button>
              <button
                type="button"
                onClick={() => activateService('SCAN', true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/[0.08] px-5 text-sm font-black text-fuchsia-100 transition hover:-translate-y-0.5 hover:border-fuchsia-200/50 hover:bg-fuchsia-300/[0.13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300 motion-reduce:transform-none"
              >
                <ScanLine className="h-4 w-4" /> สแกนภาพสินค้า
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('quick-start')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.045] px-5 text-sm font-bold text-slate-200 backdrop-blur-xl transition hover:border-violet-300/30 hover:bg-violet-300/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
              >
                <Waypoints className="h-4 w-4 text-violet-300" /> วิธีใช้งานอย่างง่าย
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />ไม่ต้องสมัครบัญชี</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />อ้างอิงแหล่งต้นฉบับ</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />รองรับการแจ้งแบบไม่ออกนาม</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[500px]" aria-label="ภาพรวมบริการประชาชน">
            <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-cyan-300/15 via-violet-400/10 to-amber-300/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[30px] border border-white/[0.12] bg-gradient-to-br from-[#0a1a2e]/95 via-[#081526]/95 to-[#160f31]/90 p-4 shadow-2xl backdrop-blur-2xl sm:p-5">
              <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-400/70" /><span className="h-2 w-2 rounded-full bg-amber-300/70" /><span className="h-2 w-2 rounded-full bg-emerald-300/70" /></div>
                <span className="font-mono text-[9px] font-bold tracking-[0.15em] text-slate-400">SMART PUBLIC CHECK</span>
              </div>
              <div className="relative my-4 flex min-h-40 items-center justify-center overflow-hidden rounded-2xl border border-fuchsia-300/15 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.16),rgba(34,211,238,0.06)_38%,transparent_68%)]">
                <div className="absolute h-36 w-36 rounded-full border border-cyan-300/10" />
                <div className="absolute h-24 w-24 rounded-full border border-violet-300/20" />
                <div className="absolute h-44 w-44 rounded-full border border-dashed border-emerald-300/10 motion-safe:animate-[spin_18s_linear_infinite]" />
                <div className="relative grid h-16 w-16 place-items-center rounded-3xl border border-cyan-200/30 bg-cyan-300/[0.12] shadow-[0_0_45px_rgba(34,211,238,0.2)]">
                  <Camera className="h-7 w-7 text-cyan-100" />
                </div>
                <span className="absolute left-4 top-4 rounded-full border border-fuchsia-300/25 bg-fuchsia-300/[0.1] px-2.5 py-1 text-[9px] font-bold text-fuchsia-100">IMAGE READY</span>
                <span className="absolute bottom-4 right-4 rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-2.5 py-1 text-[9px] font-bold text-cyan-100">AI ASSISTED</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3"><Database className="h-4 w-4 text-cyan-300" /><p className="mt-2 text-[10px] font-black text-white">ค้นทะเบียน</p></div>
                <div className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.06] p-3"><ScanLine className="h-4 w-4 text-fuchsia-300" /><p className="mt-2 text-[10px] font-black text-white">สแกนภาพ</p></div>
                <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] p-3"><ShieldCheck className="h-4 w-4 text-violet-300" /><p className="mt-2 text-[10px] font-black text-white">แจ้งเบาะแส</p></div>
                <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3"><Compass className="h-4 w-4 text-amber-300" /><p className="mt-2 text-[10px] font-black text-white">ติดตามเรื่อง</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="quick-start" className="relative z-10 pb-5" aria-labelledby="quick-start-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-[26px] border border-white/[0.09] bg-white/[0.04] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Quick start</p><h2 id="quick-start-heading" className="mt-1 text-xl font-black text-white sm:text-2xl">เริ่มใช้งานได้ใน 3 ขั้นตอน</h2></div>
              <p className="max-w-md text-xs leading-5 text-slate-500">ไม่ต้องรู้ชื่อหน่วยงานหรือขั้นตอนราชการ ระบบช่วยพาไปยังบริการที่เหมาะสม</p>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {quickStartSteps.map((item, index) => {
                const StepIcon = item.icon;
                return (
                  <li key={item.step} className="relative rounded-2xl border border-white/[0.07] bg-[#061222]/70 p-4">
                    <div className="flex items-start gap-4">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${item.surface} ${item.color}`}><StepIcon className="h-5 w-5" /></span>
                      <div><span className="font-mono text-[9px] font-black tracking-[0.15em] text-slate-600">STEP {item.step}</span><h3 className="mt-1 text-sm font-black text-white">{item.title}</h3><p className="mt-1.5 text-[11px] leading-5 text-slate-500">{item.description}</p></div>
                    </div>
                    {index < quickStartSteps.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-[#071525] p-1 text-slate-600 md:block" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main id="public-service-workspace" className="relative z-10 mx-auto max-w-7xl scroll-mt-24 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-[24px] border border-white/[0.09] bg-[#071525]/90 p-2 shadow-xl backdrop-blur-xl sm:gap-3 sm:p-3 lg:grid-cols-4" role="tablist" aria-label="เลือกบริการประชาชน">
          {publicServices.map((service) => {
            const ServiceIcon = service.icon;
            const isActive = activeTab === service.id;
            return (
              <button
                key={service.id}
                type="button"
                role="tab"
                id={`public-service-tab-${service.id.toLowerCase()}`}
                aria-label={service.fullLabel}
                aria-selected={isActive}
                aria-controls={`public-service-panel-${service.id.toLowerCase()}`}
                onClick={() => setActiveTab(service.id)}
                className={`group min-h-[76px] rounded-[18px] border px-2 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:min-h-[92px] sm:px-4 ${isActive ? 'border-cyan-300/30 bg-gradient-to-br from-cyan-300/[0.14] to-violet-300/[0.08] shadow-[0_8px_30px_rgba(34,211,238,0.09)]' : 'border-transparent text-slate-500 hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-slate-300'}`}
              >
                <span className="flex items-center gap-2"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${isActive ? 'bg-cyan-300 text-slate-950' : 'bg-white/[0.05] text-slate-500 group-hover:text-slate-300'}`}><ServiceIcon className="h-4 w-4" /></span><span className={`text-[11px] font-black sm:text-xs ${isActive ? 'text-white' : ''}`}>{service.label}</span></span>
                <span className="mt-2 hidden text-[10px] leading-4 text-slate-500 sm:block">{service.description}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: OPEN DATA SEARCH */}
        {activeTab === 'SEARCH' && (
          <div id="public-service-panel-search" role="tabpanel" aria-labelledby="public-service-tab-search" className="space-y-6">
            <form onSubmit={handleSearch} className="hud-panel space-y-5 rounded-[28px] border border-cyan-300/12 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)] sm:p-8">
              <div className="flex items-start gap-3 border-b border-white/[0.07] pb-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200"><Search className="h-5 w-5" /></span>
                <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Official registry search</p><h2 className="mt-1 text-lg font-black text-white sm:text-xl">ค้นข้อมูลจากทะเบียนทางการ</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">ค้นจาก อย., สบส. และไดเรกทอรีหน่วยบริการ สปสช. โดยตรง เช่น ชื่อผลิตภัณฑ์ เลข อย. ชื่อคลินิก ร้านนวด หรือสปา</p></div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    aria-label="คำค้นหาข้อมูลสาธารณะ"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="เลข อย./ชื่อผลิตภัณฑ์ หรือชื่อคลินิก/ร้านนวด/สปา..."
                    className="min-h-12 w-full rounded-2xl border border-white/[0.1] bg-slate-950/80 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/10"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SearchCategory)}
                  aria-label="เลือกประเภทข้อมูลที่ต้องการค้นหา"
                  className="min-h-12 rounded-2xl border border-white/[0.1] bg-slate-950/80 px-4 py-3 text-xs text-white focus:border-cyan-300 focus:outline-none"
                >
                  <option value="ALL">เลือกแหล่งให้อัตโนมัติ</option>
                  <option value="HEALTH_PRODUCTS">ผลิตภัณฑ์สุขภาพ — อย.</option>
                  <option value="HEALTH_SERVICES">คลินิก / ร้านนวด / สปา — สบส. / สปสช. (ทั้งหมด)</option>
                  <option value="CLINICS">คลินิก / สถานพยาบาล — สบส. + สปสช.</option>
                  <option value="MASSAGE_SPA">ร้านนวด / สปา — สบส.</option>
                  <option value="FRAUD_ALERTS">เตือนภัยออนไลน์ / บัญชีม้า</option>
                  <option value="COMPANIES">นิติบุคคล / บริษัท</option>
                  <option value="LICENSES">เลขทะเบียน / ใบอนุญาต — อย.</option>
                </select>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="primary-action flex min-h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-3 text-xs font-black shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  ค้นหาข้อมูล
                </button>
              </div>

              <div className="grid gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-2">
                <label className="text-[11px] font-semibold text-slate-300">
                  จังหวัดที่ต้องสงสัย <span className="font-normal text-slate-500">(กรองผลที่มีที่ตั้งระบุ)</span>
                  <input
                    list="thai-provinces"
                    value={searchProvince}
                    onChange={(event) => setSearchProvince(event.target.value)}
                    placeholder="เช่น ศรีสะเกษ"
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.1] bg-slate-950/80 px-3 text-xs text-white placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
                  />
                  <datalist id="thai-provinces">{thaiProvinces.map((province) => <option key={province} value={province} />)}</datalist>
                </label>
                <label className="text-[11px] font-semibold text-slate-300">
                  เขตภูมิภาค <span className="font-normal text-slate-500">(ส่งต่อพร้อมเรื่องร้องเรียน)</span>
                  <select value={searchHealthRegion} onChange={(event) => setSearchHealthRegion(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.1] bg-slate-950/80 px-3 text-xs text-white focus:border-cyan-300 focus:outline-none">
                    {healthRegions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] text-slate-500"><span className="font-bold text-slate-400">ค้นควบคู่:</span><span className="rounded-full border border-white/[0.07] px-2.5 py-1">ทะเบียน อย. / สบส. / สปสช.</span><span className="rounded-full border border-white/[0.07] px-2.5 py-1">ข่าวประชาสัมพันธ์ สบส.</span><a className="rounded-full border border-white/[0.07] px-2.5 py-1 hover:border-cyan-300/40 hover:text-cyan-200" href="https://oryor.com/media/newsUpdate" target="_blank" rel="noopener noreferrer">ข่าว อย. ↗</a></div>

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
                  ผลจากทะเบียนและข่าวประชาสัมพันธ์ทางการ ({searchResults.length} รายการ)
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
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => prefillComplaintFromSearch(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-300/30 bg-rose-300/[0.08] px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-300/[0.16] transition">ส่งต่อแจ้งเบาะแส <Send className="h-3.5 w-3.5" /></button>
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-400/30 bg-teal-400/10 text-xs font-bold text-teal-200 hover:bg-teal-400/20 transition"
                        >
                          ตรวจสอบข้อมูลต้นฉบับ <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searchSurveyId && (
              <SatisfactionSurvey
                key={searchSurveyId}
                audience="PUBLIC"
                context="PUBLIC_SEARCH"
                interactionId={searchSurveyId}
              />
            )}
          </div>
        )}

        {/* TAB 2: PRODUCT IMAGE SCANNER */}
        {activeTab === 'SCAN' && (
          <PublicProductScanner
            onSearch={(query) => {
              setSearchQuery(query);
              setCategory('HEALTH_PRODUCTS');
              setActiveTab('SEARCH');
            }}
            onComplaint={(prefill) => {
              setComplaintCategory('HEALTH_HAZARD');
              setTopic(prefill.topic);
              setDescription(prefill.description);
              setProductName(prefill.productName);
              setRegistrationNumber(prefill.registrationNumber);
              setActiveTab('COMPLAINT');
              window.setTimeout(() => document.getElementById('public-service-panel-complaint')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
            }}
          />
        )}

        {/* TAB 3: CITIZEN COMPLAINT FORM */}
        {activeTab === 'COMPLAINT' && (
          <div id="public-service-panel-complaint" role="tabpanel" aria-labelledby="public-service-tab-complaint" className="space-y-6">
            {complaintSuccessToken ? (
              <>
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
              {complaintSurveyId && (
                <SatisfactionSurvey
                  key={complaintSurveyId}
                  audience="PUBLIC"
                  context="PUBLIC_COMPLAINT"
                  interactionId={complaintSurveyId}
                />
              )}
              </>
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
                      <span className="text-[10px] text-slate-500 font-normal ml-auto">สูงสุด 5 ไฟล์ · ไฟล์ละ 20 MB · รวมไม่เกิน 50 MB</span>
                    </label>

                    {fileError && (
                      <div className="mb-2 p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                        {fileError}
                      </div>
                    )}

                    {selectedFiles.length === 0 ? (
                      <label className="group relative flex flex-col items-center justify-center p-5 border-2 border-dashed border-white/[0.1] hover:border-teal-400/50 rounded-2xl bg-slate-950/60 hover:bg-teal-950/10 cursor-pointer transition">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.pdf"
                          multiple
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
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center justify-between p-3.5 rounded-2xl border border-teal-500/30 bg-teal-950/20">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-400/20 text-teal-300"><FileText className="h-5 w-5" /></div>
                              <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{file.name}</p><p className="mt-0.5 font-mono text-[10px] text-teal-300/80">{(file.size / (1024 * 1024)).toFixed(2)} MB · รายการ {index + 1}/{selectedFiles.length}</p></div>
                            </div>
                            <button type="button" onClick={() => handleRemoveFile(index)} className="ml-2 shrink-0 rounded-xl border border-white/[0.1] bg-slate-900 p-1.5 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300" title={`ลบ ${file.name}`}><X className="h-4 w-4" /></button>
                          </div>
                        ))}
                        <button type="button" onClick={() => handleRemoveFile()} className="text-[10px] font-semibold text-rose-300 hover:text-rose-200">ล้างไฟล์ทั้งหมด</button>
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

        {/* TAB 4: TRACK STATUS */}
        {activeTab === 'TRACK' && (
          <div id="public-service-panel-track" role="tabpanel" aria-labelledby="public-service-tab-track" className="space-y-6">
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
