'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Filter, ShieldAlert, CheckCircle, FileText, Smartphone, Mail, FileUp, ShieldX, Loader2, RefreshCw, Clock3 } from 'lucide-react';
import { getIntakeEnvelopes, getIntakeMessages, INITIAL_INTAKE_CHANNELS, IntakeChannel, IntakeEnvelope, IntakeMessage } from '@/lib/demo-data';

export default function IntakeQueuePage() {
  const [envelopes, setEnvelopes] = useState<IntakeEnvelope[]>(() => getIntakeEnvelopes());
  const [messages, setMessages] = useState<IntakeMessage[]>(() => getIntakeMessages());
  const [channels, setChannels] = useState<IntakeChannel[]>(INITIAL_INTAKE_CHANNELS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [statusFilter, setStatusFilter] = useState('TRIAGE_PENDING');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [manualForm, setManualForm] = useState<{
    channel_id: string;
    complainant_mode: 'IDENTIFIED' | 'ANONYMOUS' | 'INCOMPLETE';
    urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
    urgency_reason: string;
    agency: string;
    region: string;
    complainant_name: string;
    complainant_phone: string;
  }>({
    channel_id: 'ch-walkin',
    complainant_mode: 'INCOMPLETE',
    urgency: 'NORMAL',
    urgency_reason: '',
    agency: '',
    region: '',
    complainant_name: '',
    complainant_phone: '',
  });

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.urgency_reason.trim()) {
      setManualError('กรุณากรอกสรุปพฤติการณ์เรื่องร้องเรียน');
      return;
    }
    if (manualForm.complainant_mode === 'IDENTIFIED' && !manualForm.complainant_name.trim()) {
      setManualError('กรุณาระบุชื่อผู้ร้อง หรือเลือกข้อมูลไม่สมบูรณ์/ไม่ประสงค์ออกนาม');
      return;
    }
    setIsSubmittingManual(true);
    setManualError('');
    setManualMessage('');
    try {
      const response = await fetch('/api/v1/intake/manual', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: manualForm.channel_id,
          complainant_mode: manualForm.complainant_mode,
          urgency: manualForm.urgency,
          urgency_reason: manualForm.urgency_reason.trim(),
          agency: manualForm.agency.trim() || undefined,
          region: manualForm.region.trim() || undefined,
          ...(manualForm.complainant_mode === 'IDENTIFIED' ? {
            complainant: {
              name: manualForm.complainant_name.trim(),
              ...(manualForm.complainant_phone.trim() ? { phone: manualForm.complainant_phone.trim() } : {}),
            },
          } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'บันทึกคำร้องไม่สำเร็จ');
      setManualMessage(body.message || 'รับคำร้องแล้วและพร้อมเข้าสู่การคัดกรอง');
      setShowManualModal(false);
      setManualForm({
        channel_id: 'ch-walkin',
        complainant_mode: 'INCOMPLETE',
        urgency: 'NORMAL',
        urgency_reason: '',
        agency: '',
        region: '',
        complainant_name: '',
        complainant_phone: '',
      });
      setIsLoading(true);
      setReloadToken(prev => prev + 1);
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'บันทึกคำร้องไม่สำเร็จ');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/intake', { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดคิวรับเรื่องไม่สำเร็จ');
        setEnvelopes(body.data.envelopes as IntakeEnvelope[]);
        setMessages(body.data.messages as IntakeMessage[]);
        setChannels(body.data.channels as IntakeChannel[]);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'โหลดคิวรับเรื่องไม่สำเร็จ');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [reloadToken]);

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'KOUPREY_PLUS': return <Smartphone className="h-4.5 w-4.5 text-indigo-400 shrink-0" />;
      case 'MAIL': return <Mail className="h-4.5 w-4.5 text-sky-400 shrink-0" />;
      case 'FILE_IMPORT': return <FileUp className="h-4.5 w-4.5 text-amber-400 shrink-0" />;
      default: return <FileText className="h-4.5 w-4.5 text-slate-400 shrink-0" />;
    }
  };

  const getChannelLabel = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    return channel ? channel.name : 'ไม่ระบุช่องทาง';
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'CRITICAL': return 'bg-rose-500/10 text-rose-400 border-rose-500/25 font-bold animate-pulse';
      case 'HIGH': return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      case 'LOW': return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
      default: return 'bg-sky-500/10 text-sky-400 border-sky-500/25';
    }
  };

  const getUrgencyLabel = (urgency: string) => {
    switch (urgency) {
      case 'CRITICAL': return 'วิกฤต';
      case 'HIGH': return 'สูง';
      case 'LOW': return 'ต่ำ';
      default: return 'ปกติ';
    }
  };

  const filteredEnvelopes = envelopes.filter(env => {
    const matchesStatus = statusFilter === 'ALL' || env.status === statusFilter;
    const matchesChannel = channelFilter === 'ALL' || env.channel_id === channelFilter;
    return matchesStatus && matchesChannel;
  });

  const importCsv = async (event: React.FormEvent) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const nativeFile = new FormData(form).get('file');
    const selectedFile = importFile
      || (nativeFile instanceof File && nativeFile.size > 0 ? nativeFile : null);
    if (!selectedFile) return setImportError('กรุณาเลือกไฟล์ CSV');
    setIsImporting(true);
    setImportError('');
    setImportMessage('');
    try {
      const formData = new FormData();
      formData.set('file', selectedFile);
      const response = await fetch('/api/v1/intake/imports', { method: 'POST', credentials: 'same-origin', body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || body.error || 'นำเข้า CSV ไม่สำเร็จ');
      setImportMessage(`นำเข้าแล้ว ${body.data.success_rows} แถว; ไม่ผ่าน ${body.data.failed_rows} แถว (Batch ${body.data.batch_id})`);
      setImportFile(null);
      form.reset();
      setIsLoading(true);
      setReloadToken((value) => value + 1);
    } catch (caught: unknown) {
      setImportError(caught instanceof Error ? caught.message : 'นำเข้า CSV ไม่สำเร็จ');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header with Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Inbox className="h-8 w-8 text-teal-300 shrink-0" />
            <span>ระบบรับเรื่องและคัดกรองเบาะแส</span>
          </h1>
          <p className="mt-2 text-slate-400 text-sm">
            ศูนย์รวมการรับเรื่องร้องเรียนและเบาะแสดิจิทัลจากทุกช่องทาง เพื่อตรวจคัดกรองความปลอดภัย ตรวจสอบความซ้ำซ้อน และส่งต่อเข้าสู่กระบวนการสืบสวน
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManualModal(true)}
          className="primary-action inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold shadow-[0_0_25px_rgba(66,232,206,0.25)] shrink-0 cursor-pointer"
        >
          + บันทึกรับเรื่องร้องเรียน
        </button>
      </div>

      {/* Manual Intake Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-[drawer-enter_300ms_var(--ease-out-expo)]">
          <div className="hud-panel rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 border border-teal-300/30 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Inbox className="h-5 w-5 text-teal-300" />
                บันทึกรับเรื่องร้องเรียนโดยตรง (Walk-in / โทรศัพท์)
              </h2>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {manualError && (
              <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs font-semibold text-rose-300">
                {manualError}
              </div>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label htmlFor="manual-complainant-mode" className="mb-1 block text-xs font-semibold text-slate-300">
                  สถานะข้อมูลผู้ร้อง <span className="text-rose-400">*</span>
                </label>
                <select
                  id="manual-complainant-mode"
                  value={manualForm.complainant_mode}
                  onChange={(event) => setManualForm((previous) => ({ ...previous, complainant_mode: event.target.value as 'IDENTIFIED' | 'ANONYMOUS' | 'INCOMPLETE' }))}
                  className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white"
                >
                  <option value="INCOMPLETE">ข้อมูลผู้ร้องยังไม่สมบูรณ์</option>
                  <option value="IDENTIFIED">ระบุชื่อผู้ร้อง</option>
                  <option value="ANONYMOUS">ไม่ประสงค์ออกนาม</option>
                </select>
              </div>

              {manualForm.complainant_mode === 'IDENTIFIED' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="manual-complainant-name" className="mb-1 block text-xs font-semibold text-slate-300">ชื่อผู้ร้อง <span className="text-rose-400">*</span></label>
                    <input
                      id="manual-complainant-name"
                      type="text"
                      required
                      maxLength={200}
                      value={manualForm.complainant_name}
                      onChange={(event) => setManualForm((previous) => ({ ...previous, complainant_name: event.target.value }))}
                      placeholder="ชื่อ-นามสกุล"
                      className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="manual-complainant-phone" className="mb-1 block text-xs font-semibold text-slate-300">เบอร์ติดต่อ</label>
                    <input
                      id="manual-complainant-phone"
                      type="tel"
                      maxLength={30}
                      value={manualForm.complainant_phone}
                      onChange={(event) => setManualForm((previous) => ({ ...previous, complainant_phone: event.target.value }))}
                      placeholder="เช่น 081-234-5678"
                      className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="manual-urgency" className="block text-xs font-semibold text-slate-300 mb-1">
                  ระดับความเร่งด่วน <span className="text-rose-400">*</span>
                </label>
                <select
                  id="manual-urgency"
                  value={manualForm.urgency}
                  onChange={(e) => setManualForm(prev => ({ ...prev, urgency: e.target.value as 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' }))}
                  className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white"
                >
                  <option value="NORMAL">ปกติ (NORMAL)</option>
                  <option value="HIGH">เร่งด่วน (HIGH)</option>
                  <option value="CRITICAL">วิกฤต (CRITICAL)</option>
                  <option value="LOW">เฝ้าระวัง (LOW)</option>
                </select>
              </div>

              <div>
                <label htmlFor="manual-summary" className="block text-xs font-semibold text-slate-300 mb-1">
                  สรุปพฤติการณ์ / หัวข้อเรื่องร้องเรียน <span className="text-rose-400">*</span>
                </label>
                <textarea
                  id="manual-summary"
                  required
                  rows={3}
                  value={manualForm.urgency_reason}
                  onChange={(e) => setManualForm(prev => ({ ...prev, urgency_reason: e.target.value }))}
                  placeholder="ระบุรายละเอียดและพฤติการณ์เรื่องร้องเรียน..."
                  className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white placeholder:text-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    หน่วยงานผู้รับผิดชอบ
                  </label>
                  <input
                    type="text"
                    value={manualForm.agency}
                    onChange={(e) => setManualForm(prev => ({ ...prev, agency: e.target.value }))}
                    placeholder="เช่น สภ.เมือง หรือ บช.สอท."
                    className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    พื้นที่ / จังหวัด
                  </label>
                  <input
                    type="text"
                    value={manualForm.region}
                    onChange={(e) => setManualForm(prev => ({ ...prev, region: e.target.value }))}
                    placeholder="เช่น ศรีสะเกษ หรือ อุบลราชธานี"
                    className="w-full rounded-xl border border-white/[0.1] bg-slate-950 p-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isSubmittingManual}
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="primary-action inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingManual && <Loader2 className="h-4 w-4 animate-spin" />}
                  บันทึกรับเรื่อง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Summary Indicators */}
      {manualMessage && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm font-semibold text-emerald-300">
          {manualMessage}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-500 uppercase font-semibold">รอการคัดกรอง (Triage Pending)</span>
          <span className="text-3xl font-bold text-indigo-400 mt-2">
            {envelopes.filter(e => e.status === 'TRIAGE_PENDING').length} เรื่อง
          </span>
        </div>
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-500 uppercase font-semibold">เฝ้าระวังความปลอดภัย (Quarantined)</span>
          <span className="text-3xl font-bold text-rose-500 mt-2 flex items-center">
            {envelopes.filter(e => e.status === 'QUARANTINED').length} ไฟล์
            {envelopes.some(e => e.status === 'QUARANTINED') && <ShieldX className="h-5 w-5 ml-2 text-rose-500 animate-pulse" />}
          </span>
        </div>
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-500 uppercase font-semibold">อนุมัติเป็นคดีแล้ว (Promoted)</span>
          <span className="text-3xl font-bold text-emerald-400 mt-2">
            {envelopes.filter(e => e.status === 'PROMOTED').length} คดี
          </span>
        </div>
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-500 uppercase font-semibold">คัดกรองเสร็จสิ้นวันนี้</span>
          <span className="text-3xl font-bold text-slate-300 mt-2">
            {envelopes.filter(e => ['PROMOTED', 'MERGED', 'REJECTED'].includes(e.status)).length} เรื่อง
          </span>
        </div>
      </div>

      {/* Filter and controls */}
      <form onSubmit={importCsv} className="rounded-3xl border border-slate-900 bg-slate-900/30 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="flex items-center text-sm font-bold text-white"><FileUp className="mr-2 h-4 w-4 text-amber-300" />นำเข้ารายการรับเรื่องจาก CSV</h2><p className="mt-1 text-xs leading-5 text-slate-500">UTF-8 ไม่เกิน 2 MB/1,000 แถว · ต้องมี complainant_mode, urgency, urgency_reason · รองรับ quoted fields; ไม่รองรับ ZIP</p></div><div className="flex flex-col gap-2 sm:flex-row"><input name="file" type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] || null)} className="max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300" /><button disabled={isImporting} className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">{isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}นำเข้า</button></div></div>
        {importError && <p role="alert" className="mt-3 text-xs text-rose-300">{importError}</p>}{importMessage && <p role="status" className="mt-3 text-xs text-emerald-300">{importMessage}</p>}
      </form>

      <div className="flex flex-col lg:flex-row gap-4 bg-slate-900/40 p-4 border border-slate-900 rounded-3xl items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
            <Filter className="h-4 w-4 mr-1 text-indigo-400" /> สถานะ:
          </span>
          {['TRIAGE_PENDING', 'QUARANTINED', 'PROMOTED', 'ALL'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                statusFilter === status
                  ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {status === 'ALL' ? 'ทั้งหมด' : 
               status === 'TRIAGE_PENDING' ? 'รอคัดกรอง' : 
               status === 'QUARANTINED' ? 'กักกันความปลอดภัย' : 'อนุมัติเปิดคดี'}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ช่องทางหลัก:</span>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="block rounded-xl border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-slate-800 focus:ring-2 focus:ring-indigo-500 text-xs"
          >
            <option value="ALL">ทุกช่องทาง</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table queue */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-slate-400" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังโหลดคิวรับเรื่อง...</div>
        ) : loadError ? (
          <div className="py-16 text-center" role="alert"><p className="text-sm text-rose-300">{loadError}</p><button type="button" onClick={() => { setIsLoading(true); setLoadError(''); setReloadToken((value) => value + 1); }} className="mt-4 inline-flex items-center rounded-xl border border-rose-400/20 px-4 py-2 text-xs font-semibold text-rose-200"><RefreshCw className="mr-2 h-4 w-4" />ลองใหม่</button></div>
        ) : filteredEnvelopes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-950 text-xs md:text-sm">
              <thead>
                <tr className="text-slate-400 text-left font-medium">
                  <th className="pb-3">ช่องทาง & วันเวลา</th>
                  <th className="pb-3">ความเร่งด่วน</th>
                  <th className="pb-3">การตรวจไฟล์</th>
                  <th className="pb-3">ผู้ร้องเรียน</th>
                  <th className="pb-3">ข้อมูลย่อสาระสำคัญ</th>
                  <th className="pb-3 text-right">การคัดกรอง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-950/60 text-slate-300">
                {filteredEnvelopes.map((env) => {
                  const msg = messages.find(m => m.envelope_id === env.id);
                  let preview = 'ไม่มีเนื้อหาข้อความ';
                  if (msg) {
                    try {
                      const payload = JSON.parse(msg.raw_payload);
                      preview = payload.text || payload.description || msg.raw_payload;
                    } catch {
                      preview = msg.raw_payload;
                    }
                  }

                  return (
                    <tr key={env.id} className="hover:bg-slate-900/20">
                      <td className="py-4">
                        <div className="flex items-center space-x-2.5">
                          {getChannelIcon(channels.find(c => c.id === env.channel_id)?.type || '')}
                          <div>
                            <span className="font-semibold block text-white">{getChannelLabel(env.channel_id)}</span>
                            <span className="text-[10px] text-slate-500">{new Date(env.created_at).toLocaleString('th-TH')}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-semibold border rounded-lg ${getUrgencyBadge(env.urgency)}`}>
                          {getUrgencyLabel(env.urgency)}
                        </span>
                      </td>
                      <td className="py-4">
                        {env.malware_scan_status === 'INFECTED' ? (
                          <span className="inline-flex items-center px-2 py-0.5 border border-rose-500/35 bg-rose-500/10 text-rose-400 rounded text-[10px] font-semibold animate-pulse">
                            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                            ความเสี่ยงเดิม
                          </span>
                        ) : env.malware_scan_status === 'CLEAN' ? (
                          <span className="inline-flex items-center px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 rounded text-[10px] font-semibold">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            สแกนแล้ว (เดิม)
                          </span>
                        ) : env.malware_scan_status === 'NOT_SCANNED' ? (
                          <span className="inline-flex items-center px-2 py-0.5 border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 rounded text-[10px] font-semibold">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            ตรวจรูปแบบแล้ว
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 border border-amber-500/25 bg-amber-500/10 text-amber-300 rounded text-[10px] font-semibold">
                            <Clock3 className="h-3.5 w-3.5 mr-1" />
                            ยังไม่พร้อม
                          </span>
                        )}
                      </td>
                      <td className="py-4">
                        {env.complainant_mode === 'ANONYMOUS' ? (
                          <span className="text-slate-500 italic font-medium">ไม่ระบุตัวตน (Anonymous)</span>
                        ) : env.complainant_mode === 'INCOMPLETE' ? (
                          <span className="text-amber-500 font-medium">ข้อมูลไม่สมบูรณ์</span>
                        ) : (
                          <span className="text-indigo-400 font-semibold">ระบุตัวตนถูกต้อง</span>
                        )}
                      </td>
                      <td className="py-4 max-w-xs truncate text-slate-400">
                        {preview}
                      </td>
                      <td className="py-4 text-right">
                        <Link
                          href={`/intake/${env.id}`}
                          className="inline-flex items-center justify-center px-3.5 py-2 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white text-xs font-bold rounded-xl transition-all"
                        >
                          จัดการเรื่อง
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-20 border border-slate-900 border-dashed rounded-2xl">
            <Inbox className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">ไม่มีคำร้องร้องเรียนค้างรอคัดแยกในขณะนี้</p>
          </div>
        )}
      </div>
    </div>
  );
}
