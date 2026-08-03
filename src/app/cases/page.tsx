'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Briefcase, Plus, Search, Calendar, FolderOpen, Shield } from 'lucide-react';
import { getCases, Case } from '@/lib/demo-data';

export default function CasesPage() {
  const [casesList, setCasesList] = useState<Case[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED' | 'CLOSED'>('ALL');

  useEffect(() => {
    // Load cases from stateful database helper
    setCasesList(getCases());
  }, []);

  const filteredCases = casesList.filter((c) => {
    const matchesSearch = 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'ARCHIVED': return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Briefcase className="h-8 w-8 text-indigo-500 shrink-0" />
            <span>คดีสืบสวนทั้งหมด</span>
          </h1>
          <p className="mt-2 text-slate-400">
            ระบบจัดการสำนวนคดี ค้นหาข้อมูล และการเชื่อมโยงข้ามคดีอาชญากรรมทางเทคโนโลยี
          </p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 transition-all duration-200 cursor-pointer"
        >
          <Plus className="h-5 w-5 mr-2 shrink-0" />
          สร้างคดีใหม่
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col lg:flex-row gap-4 bg-slate-900/40 p-4 border border-slate-900 rounded-3xl">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="ค้นหาชื่อคดี เลขคดี หรือรายละเอียด..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl py-3 pl-12 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs text-slate-500 mr-2 uppercase tracking-wide font-medium">กรองสถานะ:</span>
          {(['ALL', 'ACTIVE', 'ARCHIVED', 'CLOSED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                statusFilter === filter
                  ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {filter === 'ALL' ? 'ทั้งหมด' : filter === 'ACTIVE' ? 'กำลังสืบสวน' : filter === 'ARCHIVED' ? 'เก็บถาวร' : 'ปิดคดีแล้ว'}
            </button>
          ))}
        </div>
      </div>

      {/* Cases List */}
      {filteredCases.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCases.map((c) => (
            <div
              key={c.id}
              className="bg-slate-900/30 border border-slate-900 hover:border-indigo-500/20 rounded-3xl p-6 transition-all duration-200 flex flex-col justify-between group hover:shadow-2xl hover:shadow-indigo-500/[0.01]"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-mono font-bold text-indigo-400 px-3 py-1.5 bg-indigo-500/5 rounded-xl border border-indigo-500/15">
                    {c.number}
                  </span>
                  <span className={`px-2.5 py-1 text-[10px] font-semibold border rounded-lg ${getStatusColor(c.status)}`}>
                    {c.status === 'ACTIVE' ? 'กำลังดำเนินการ' : c.status === 'ARCHIVED' ? 'เก็บถาวร' : 'ปิดคดีแล้ว'}
                  </span>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 line-clamp-2 leading-relaxed">
                    {c.description || 'ไม่มีรายละเอียดเพิ่มเติม'}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-900/60 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-4">
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1.5 shrink-0 text-slate-600" />
                    {new Date(c.created_at).toLocaleDateString('th-TH')}
                  </span>
                  <span className="flex items-center">
                    <Shield className="h-4 w-4 mr-1.5 shrink-0 text-slate-600" />
                    {c.created_by}
                  </span>
                </div>

                <Link
                  href={`/cases/${c.id}`}
                  className="inline-flex items-center text-xs font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors"
                >
                  <FolderOpen className="h-4 w-4 mr-1.5 shrink-0" />
                  เปิดห้องคดี
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900/10 border border-slate-900 border-dashed rounded-3xl">
          <Briefcase className="h-12 w-12 text-slate-600 mx-auto" />
          <h3 className="mt-4 text-lg font-semibold text-white">ไม่พบคดีสืบสวน</h3>
          <p className="mt-2 text-sm text-slate-500">
            ลองปรับเปลี่ยนคำค้นหาหรือคำกรองข้อมูล
          </p>
        </div>
      )}
    </div>
  );
}
