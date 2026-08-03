'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, Search, Filter, ShieldAlert } from 'lucide-react';
import { getEntities, getCases, ExtractedEntity } from '@/lib/demo-data';

export default function EntitiesPage() {
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [casesList, setCasesList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  useEffect(() => {
    setEntities(getEntities());
    setCasesList(getCases());
  }, []);

  const getEntityTypeLabel = (type: string) => {
    switch (type) {
      case 'PERSON': return 'บุคคล';
      case 'PHONE': return 'เบอร์โทรศัพท์';
      case 'EMAIL': return 'อีเมล';
      case 'BANK_ACCOUNT': return 'บัญชีธนาคาร';
      case 'CITIZEN_ID': return 'เลขบัตรประชาชน';
      case 'ORGANIZATION': return 'องค์กร/บริษัท';
      default: return 'สถานที่';
    }
  };

  const getEntityBadgeColor = (type: string) => {
    switch (type) {
      case 'PERSON': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'PHONE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'BANK_ACCOUNT': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'CITIZEN_ID': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    }
  };

  const filteredEntities = entities.filter(ent => {
    const matchesSearch = ent.value.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'ALL' || ent.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Database className="h-8 w-8 text-indigo-500 shrink-0" />
          <span>ทะเบียนข้อมูลกลาง (Entity Register)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          ทะเบียนข้อมูลเอนทิตีที่ได้รับการตรวจสอบยืนยันแล้วจากไฟล์หลักฐานทั้งหมดในคดีต่างๆ แยกประเภทเพื่อวิเคราะห์การทับซ้อน
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4 bg-slate-900/40 p-4 border border-slate-900 rounded-3xl">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="ค้นหาค่าข้อมูลเอนทิตี..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl py-3 pl-12 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs text-slate-500 mr-2 uppercase tracking-wide font-medium">ประเภท:</span>
          {['ALL', 'PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                typeFilter === type
                  ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {type === 'ALL' ? 'ทั้งหมด' : getEntityTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* Registry Table */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
        {filteredEntities.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-950 text-sm">
              <thead>
                <tr className="text-slate-400 text-left font-medium">
                  <th className="pb-3">ประเภทข้อมูล</th>
                  <th className="pb-3">ค่าข้อมูล (Value)</th>
                  <th className="pb-3">คดีที่ปรากฏ</th>
                  <th className="pb-3">วันที่ยืนยัน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-950/60 text-slate-300">
                {filteredEntities.map((ent) => {
                  const matchedCase = casesList.find(c => c.id === ent.case_id);
                  return (
                    <tr key={ent.id} className="hover:bg-slate-900/20">
                      <td className="py-4">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-semibold border rounded-lg ${getEntityBadgeColor(ent.type)}`}>
                          {getEntityTypeLabel(ent.type)}
                        </span>
                      </td>
                      <td className="py-4 font-semibold text-white">{ent.value}</td>
                      <td className="py-4">
                        {matchedCase ? (
                          <Link href={`/cases/${matchedCase.id}`} className="text-indigo-400 hover:underline">
                            {matchedCase.number} - {matchedCase.title}
                          </Link>
                        ) : (
                          <span className="text-slate-500">ไม่พบคดี</span>
                        )}
                      </td>
                      <td className="py-4 text-slate-400">
                        {new Date(ent.created_at).toLocaleDateString('th-TH')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <Database className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">ไม่พบบันทึกข้อมูลเอนทิตีที่ค้นหา</p>
          </div>
        )}
      </div>
    </div>
  );
}
