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

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Inbox className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>Omnichannel Intake Triage (กล่องคัดกรองคำร้องระดับประเทศ)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          รับข้อมูลคำร้องและเอกสารเบาะแสจากทุกช่องทาง (Kouprey Plus, API พันธมิตร, อีเมล, Walk-in) เพื่อสแกนความปลอดภัย ค้นเรื่องซ้ำ และคัดแยกสำนวนคดี
        </p>
      </div>

      {/* Summary Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-500 uppercase font-semibold">ค้างคัดแยก (Triage Pending)</span>
          <span className="text-3xl font-bold text-indigo-400 mt-2">
            {envelopes.filter(e => e.status === 'TRIAGE_PENDING').length} เรื่อง
          </span>
        </div>
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-500 uppercase font-semibold">ไฟล์กักกันความปลอดภัย (Quarantined)</span>
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
                  <th className="pb-3">สแกนมัลแวร์</th>
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
                            ติดมัลแวร์
                          </span>
                        ) : env.malware_scan_status === 'CLEAN' ? (
                          <span className="inline-flex items-center px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 rounded text-[10px] font-semibold">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            ปลอดภัย
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 border border-amber-500/25 bg-amber-500/10 text-amber-300 rounded text-[10px] font-semibold">
                            <Clock3 className="h-3.5 w-3.5 mr-1" />
                            {env.malware_scan_status === 'PENDING' ? 'รอตรวจ' : 'ตรวจไม่สำเร็จ'}
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
