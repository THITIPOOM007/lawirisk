'use client';

import React, { useState, useEffect } from 'react';
import { Link2, AlertTriangle, Check, X, ShieldAlert, AlertCircle, FileCheck, HelpCircle } from 'lucide-react';
import { getMatches, getCases, updateMatchStatus, MatchCandidate } from '@/lib/demo-data';

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [casesList, setCasesList] = useState<any[]>([]);
  const [userRole, setUserRole] = useState('VIEWER');
  
  // Enforcing strict matching warning states
  const [bypassNameCheck, setBypassNameCheck] = useState<{ [key: string]: boolean }>({});
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setMatches(getMatches());
    setCasesList(getCases());

    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    setUserRole(getCookie('mock-auth-role') || 'VIEWER');
  }, []);

  const handleUpdateStatus = (id: string, status: 'VERIFIED' | 'DISMISSED') => {
    if (userRole !== 'ADMIN' && userRole !== 'REVIEWER') {
      alert('คุณไม่มีสิทธิ์ผู้ตรวจทาน (REVIEWER/ADMIN) ในการจัดการความเชื่อมโยงคดี');
      return;
    }

    const matchItem = matches.find(m => m.id === id);
    if (!matchItem) return;

    // Enforce name-only check policy
    if (status === 'VERIFIED' && matchItem.entity_type === 'PERSON' && !bypassNameCheck[id]) {
      alert('นโยบายความปลอดภัย: ห้ามจับคู่คดีด้วยชื่อบุคคลเพียงอย่างเดียวโดยไม่ได้ยืนยันหลักฐานสมทบเพิ่มเติม');
      return;
    }

    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    const reviewer = getCookie('mock-auth-name') 
      ? decodeURIComponent(getCookie('mock-auth-name')!) 
      : 'ผู้ตรวจทาน';

    updateMatchStatus(id, status, reviewer);
    setMatches(getMatches());
    setSuccessMsg(`อัปเดตสถานะความเชื่อมโยงเรียบร้อยแล้ว: ${status}`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const getEntityTypeLabel = (type: string) => {
    switch (type) {
      case 'PERSON': return 'บุคคล';
      case 'PHONE': return 'เบอร์โทรศัพท์';
      case 'EMAIL': return 'อีเมล';
      case 'BANK_ACCOUNT': return 'บัญชีธนาคาร';
      case 'CITIZEN_ID': return 'เลขบัตรประชาชน';
      default: return 'สถานที่';
    }
  };

  const getMatchStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'DISMISSED': return 'bg-rose-500/10 text-rose-400 border-rose-500/25';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Link2 className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>วิเคราะห์ความเชื่อมโยงข้ามคดี (Cross-Case Linkage)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          วิเคราะห์เอนทิตีที่ซ้ำซ้อนกันระหว่างคดีอาชญากรรมต่างๆ เพื่อระบุเครือข่ายบัญชีม้า เบอร์แก๊งคอลเซ็นเตอร์ หรือผู้บงการร่วม
        </p>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-4 rounded-2xl text-emerald-300 text-sm">
          {successMsg}
        </div>
      )}

      {/* Main Link Ledger */}
      <div className="space-y-6">
        {matches.length > 0 ? (
          <div className="space-y-4">
            {matches.map((item) => {
              const sourceCase = casesList.find(c => c.id === item.source_case_id);
              const targetCase = casesList.find(c => c.id === item.target_case_id);
              const isPersonType = item.entity_type === 'PERSON';

              return (
                <div
                  key={item.id}
                  className={`p-6 border rounded-3xl transition-all ${
                    item.status === 'VERIFIED' ? 'bg-emerald-950/5 border-emerald-900/60' :
                    item.status === 'DISMISSED' ? 'bg-rose-950/5 border-rose-900/60' :
                    'bg-slate-900/20 border-slate-900 hover:border-indigo-500/25'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="space-y-3.5 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-1 text-[10px] font-semibold border rounded-lg bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                          ข้อมูลที่ตรงกัน: {getEntityTypeLabel(item.entity_type)}
                        </span>
                        <span className="text-xs text-slate-500">
                          ความน่าจะเป็น: {(item.confidence * 100).toFixed(0)}%
                        </span>
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded-md ${getMatchStatusBadge(item.status)}`}>
                          {item.status === 'PENDING' ? 'รอสืบสวนเพิ่มเติม' : item.status === 'VERIFIED' ? 'ยืนยันความเชื่อมโยง' : 'ปฏิเสธ/ไม่ใช่'}
                        </span>
                      </div>

                      <p className="text-xl font-bold text-white tracking-wide">
                        {item.entity_value}
                      </p>

                      {/* Connection Cases Box */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/50 p-4 border border-slate-900 rounded-2xl text-sm">
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">คดีต้นทาง</span>
                          {sourceCase ? (
                            <p className="font-bold text-slate-300">{sourceCase.number} - {sourceCase.title}</p>
                          ) : (
                            <p className="text-slate-500">ไม่พบคดี</p>
                          )}
                        </div>
                        <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-900 pt-3 sm:pt-0 sm:pl-4">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">คดีเชื่อมโยง</span>
                          {targetCase ? (
                            <p className="font-bold text-slate-300">{targetCase.number} - {targetCase.title}</p>
                          ) : (
                            <p className="text-slate-500">ไม่พบคดี</p>
                          )}
                        </div>
                      </div>

                      {/* strict name match policy block */}
                      {isPersonType && item.status === 'PENDING' && (
                        <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded-2xl space-y-3">
                          <div className="flex items-start space-x-2 text-xs text-amber-400 leading-relaxed">
                            <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              **ข้อพึงระวังตามนโยบายระบบ:** การจับคู่ชื่อบุคคลเพียงอย่างเดียวโดยไม่มีเลขบัญชีธนาคาร เบอร์โทรศัพท์ หรือเลขบัตรประชาชนสมทบ มีความเสี่ยงที่จะเป็นชื่อพ้องกัน (บุคคลละคนกัน)
                            </span>
                          </div>
                          
                          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!bypassNameCheck[item.id]}
                              onChange={(e) => setBypassNameCheck(prev => ({ ...prev, [item.id]: e.target.checked }))}
                              className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 bg-slate-950"
                            />
                            <span>ข้าพเจ้ายืนยันว่าได้วิเคราะห์ไฟล์เอกสารหลักฐานสมทบ และยืนยันว่าเป็นบุคคลเดียวกันจริง</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Verification Actions */}
                    {item.status === 'PENDING' && (userRole === 'ADMIN' || userRole === 'REVIEWER') && (
                      <div className="flex sm:flex-col lg:flex-row items-center gap-3 shrink-0 self-end lg:self-center">
                        <button
                          onClick={() => handleUpdateStatus(item.id, 'DISMISSED')}
                          className="px-4 py-2.5 border border-slate-800 hover:border-rose-900 hover:bg-rose-950/20 text-xs font-semibold text-rose-400 rounded-2xl flex items-center cursor-pointer transition-all"
                        >
                          <X className="h-4.5 w-4.5 mr-1.5 shrink-0" />
                          ปฏิเสธ
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(item.id, 'VERIFIED')}
                          disabled={isPersonType && !bypassNameCheck[item.id]}
                          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white rounded-2xl flex items-center cursor-pointer transition-all"
                        >
                          <Check className="h-4.5 w-4.5 mr-1.5 shrink-0" />
                          ยืนยันความเชื่อมโยง
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-900/10 border border-slate-900 border-dashed rounded-3xl">
            <Link2 className="h-12 w-12 text-slate-700 mx-auto" />
            <h3 className="mt-4 text-lg font-semibold text-white">ไม่พบข้อมูลผู้ถูกจับคู่สัมพันธ์</h3>
          </div>
        )}
      </div>
    </div>
  );
}
