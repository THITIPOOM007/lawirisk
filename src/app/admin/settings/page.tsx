'use client';

import React, { useState } from 'react';
import { Settings, Save, ShieldAlert, ToggleLeft, ToggleRight, Users, Database, Smartphone, Landmark, ShieldCheck } from 'lucide-react';
import { getSettings, saveSettings, INITIAL_USERS, UserProfile, UserSettings, addAuditLog, INITIAL_INTAKE_CHANNELS, IntakeChannel } from '@/lib/demo-data';
import { roleLabel } from '@/lib/roles';

export default function AdminSettingsPage() {
  const [settings] = useState<UserSettings>(() => getSettings());
  const users: UserProfile[] = INITIAL_USERS;
  const channels: IntakeChannel[] = INITIAL_INTAKE_CHANNELS;
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form parameters
  const [threshold, setThreshold] = useState(() => getSettings().confidenceThreshold);
  const [autoExtract, setAutoExtract] = useState(() => getSettings().autoExtraction);
  const [webhookUrl, setWebhookUrl] = useState('https://n8n.evidenceverse.go.th/webhook/search');

  // Agencies state mock
  const agencies = [
    { id: 'a-1', name: 'กองบริหารสาธารณสุขส่วนกลาง', level: 'CENTRAL' },
    { id: 'a-2', name: 'สำนักงานสาธารณสุขจังหวัดศรีสะเกษ', level: 'PROVINCE' },
    { id: 'a-3', name: 'โรงพยาบาลขุขันธ์', level: 'FACILITY' }
  ];

  // Laws state mock
  const laws = [
    { id: 'l-1', name: 'พระราชบัญญัติวิชาชีพทันตกรรม พ.ศ. 2537', code: 'มาตรา 28' },
    { id: 'l-2', name: 'พระราชบัญญัติสถานพยาบาล พ.ศ. 2541', code: 'มาตรา 16' },
    { id: 'l-3', name: 'พระราชบัญญัติเครื่องมือแพทย์ พ.ศ. 2551', code: 'มาตรา 46' }
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newSettings: UserSettings = {
      ...settings,
      confidenceThreshold: threshold,
      autoExtraction: autoExtract,
    };

    saveSettings(newSettings);
    
    // Audit Log
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    const user = getCookie('mock-auth-name') 
      ? decodeURIComponent(getCookie('mock-auth-name')!) 
      : 'ผู้ดูแลระบบ';
    addAuditLog(user, 'SETTINGS_UPDATE', 'ปรับปรุงค่าการตั้งค่าระดับระบบ (System Settings)');

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const getRoleLabel = roleLabel;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Settings className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>จัดการระบบและการตั้งค่า (System Control Panel)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          กำหนดระดับความเชื่อมั่นของ AI ตัวเลือก webhook n8n ช่องทางการรับเรื่อง เครือข่ายหน่วยงาน และข้อบทกฎหมายอ้างอิง
        </p>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-2xl text-emerald-300 text-sm">
          บันทึกการตั้งค่าระบบเรียบร้อยแล้ว! (ประวัติกิจกรรมถูกบันทึกใน Audit log)
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Settings Form (Left 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center">
              <Database className="h-5 w-5 mr-2 text-indigo-500" />
              การกำหนดค่าการทำงานระบบวิเคราะห์หลักฐาน
            </h3>

            <form onSubmit={handleSave} className="space-y-6">
              
              {/* Threshold */}
              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  เกณฑ์ระดับความเชื่อมั่นขั้นต่ำของ AI (Confidence Threshold)
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  ระบุความน่าจะเป็นขั้นต่ำที่อนุญาตให้ AI แสดงผลในการทำ Matching คดีสืบสวน (0.00 - 1.00)
                </p>
                <div className="mt-3 flex items-center space-x-4">
                  <input
                    type="range"
                    min="0.50"
                    max="0.99"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="flex-1 accent-indigo-500 h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="font-mono text-sm font-bold text-indigo-400 w-12 text-right">{(threshold * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* Toggle Auto Extract */}
              <div className="flex items-center justify-between p-4 bg-slate-950/40 border border-slate-900 rounded-2xl">
                <div>
                  <label className="block text-sm font-semibold text-slate-300">
                    เรียกงานสกัดคำอัตโนมัติ (Auto AI Extraction)
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    เมื่ออัปโหลดหลักฐานเสร็จสิ้น ระบบจะเรียก OCR และวิเคราะห์ Entity ทันที
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoExtract(!autoExtract)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  {autoExtract ? (
                    <ToggleRight className="h-10 w-10 text-indigo-500" />
                  ) : (
                    <ToggleLeft className="h-10 w-10 text-slate-600" />
                  )}
                </button>
              </div>

              {/* Webhook Settings */}
              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  ที่อยู่เว็บฮุกค้นหาอัจฉริยะ (n8n Webhook Endpoint)
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  URL ของ workflow n8n ที่รับผิดชอบการเชื่อมต่อ Thai FDA และ Data.go.th
                </p>
                <div className="mt-2">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://n8n.yourdomain.com/..."
                    className="block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-900 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center px-5 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  <Save className="h-5 w-5 mr-2" />
                  บันทึกการตั้งค่า
                </button>
              </div>
            </form>
          </div>

          {/* Config Controls for Channels & Laws */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Channels listing */}
            <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center">
                <Smartphone className="h-4.5 w-4.5 mr-2 text-indigo-400" /> ช่องทางการรับเรื่องร้องเรียน (Channels)
              </h3>
              <div className="space-y-2 text-xs">
                {channels.map(ch => (
                  <div key={ch.id} className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex justify-between items-center text-slate-300">
                    <span>{ch.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{ch.type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Laws listing */}
            <div className="p-6 bg-slate-900/40 border border-slate-900 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center">
                <ShieldCheck className="h-4.5 w-4.5 mr-2 text-indigo-400" /> สารบบข้อบทกฎหมายและมาตรา (Laws Catalog)
              </h3>
              <div className="space-y-2 text-xs">
                {laws.map(law => (
                  <div key={law.id} className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex justify-between items-center text-slate-300">
                    <span className="truncate max-w-[150px]">{law.name}</span>
                    <span className="text-[10px] text-indigo-400 font-bold font-mono">{law.code}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* User & Agency Management View (Right 1/3) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Members listing */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center">
              <Users className="h-5 w-5 mr-2 text-indigo-500" />
              เจ้าหน้าที่ผู้เข้าถึงระบบ ({users.length})
            </h3>

            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-white">{user.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                  </div>
                  <span className="px-2.5 py-1 text-[10px] font-semibold border rounded-lg bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                    {getRoleLabel(user.role)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Agencies listing */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center">
              <Landmark className="h-5 w-5 mr-2 text-indigo-500" />
              หน่วยงานและเขตอำนาจ (Agencies)
            </h3>

            <div className="space-y-4 text-xs">
              {agencies.map((age) => (
                <div
                  key={age.id}
                  className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl flex items-center justify-between"
                >
                  <span className="text-white font-semibold">{age.name}</span>
                  <span className="px-2 py-0.5 text-[10px] font-semibold border rounded bg-indigo-500/10 text-indigo-400 border-indigo-500/25">
                    {age.level}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="mt-6 bg-slate-950/40 p-4 border border-slate-900 rounded-2xl flex items-start space-x-2 text-xs text-slate-400 leading-relaxed">
              <ShieldAlert className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                การเข้าใช้งานตามหน่วยงาน เขตอำนาจ และบทบาทระดับประเทศ ถูกแยก RLS ในระดับฐานข้อมูล SQL ป้องกันการเข้าถึงข้อมูลนอกสิทธิ์เด็ดขาด
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
