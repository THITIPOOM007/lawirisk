'use client';

import React, { useState, useEffect } from 'react';
import { History, Download, Search, RefreshCw, Calendar, Shield } from 'lucide-react';
import { getAuditLogs, AuditLog } from '@/lib/demo-data';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    setLogs(getAuditLogs());
  }, []);

  const handleRefresh = () => {
    setLogs(getAuditLogs());
  };

  const handleExportCSV = () => {
    // Generate CSV string
    const headers = ['ID', 'User', 'Action', 'Details', 'IP Address', 'Timestamp'];
    const rows = logs.map(log => [
      log.id,
      log.profile_name,
      log.action,
      log.details.replace(/"/g, '""'), // escape quotes
      log.ip_address,
      log.created_at,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${val}"`).join(',')),
    ].join('\n');

    // Download CSV trigger
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' }); // add BOM for Excel Thai language support
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_trail_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <History className="h-8 w-8 text-indigo-500 shrink-0 animate-pulse" />
            <span>Audit Trail Ledger (บันทึกกิจกรรมระบบ)</span>
          </h1>
          <p className="mt-2 text-slate-400">
            ระบบตรวจสอบย้อนกลับบันทึกการใช้งานของเจ้าหน้าที่ (Immutable Append-only Ledger) ป้องกันการแก้ไขหรือลบประวัติหลักฐาน
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleRefresh}
            className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-2xl transition-colors cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center px-4 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-all cursor-pointer"
          >
            <Download className="h-5 w-5 mr-2 shrink-0" />
            ส่งออกไฟล์ CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 bg-slate-900/40 p-4 border border-slate-900 rounded-3xl">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="ค้นหาชื่อผู้ปฏิบัติงาน รายละเอียด หรือกิจกรรม..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl py-3 pl-12 pr-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs text-slate-500 mr-2 uppercase tracking-wide font-medium">กรองประเภท:</span>
          {['ALL', 'CASE_CREATE', 'EVIDENCE_UPLOAD', 'RELATION_VERIFY', 'REPORT_GENERATE', 'MATCH_REVIEW'].map((action) => (
            <button
              key={action}
              onClick={() => setActionFilter(action)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                actionFilter === action
                  ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {action === 'ALL' ? 'ทั้งหมด' : 
               action === 'CASE_CREATE' ? 'สร้างคดี' : 
               action === 'EVIDENCE_UPLOAD' ? 'นำเข้าพยานหลักฐาน' : 
               action === 'RELATION_VERIFY' ? 'ยืนยันความสัมพันธ์' : 
               action === 'REPORT_GENERATE' ? 'พิมพ์รายงาน' : 'ตรวจสอบความเชื่อมโยง'}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Ledger Table */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
        {filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-950 text-xs md:text-sm">
              <thead>
                <tr className="text-slate-400 text-left font-medium">
                  <th className="pb-3">ผู้ปฏิบัติงาน</th>
                  <th className="pb-3">กิจกรรม</th>
                  <th className="pb-3">รายละเอียดการดำเนินงาน</th>
                  <th className="pb-3">IP Address</th>
                  <th className="pb-3">วันเวลาบันทึก (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-950/60 text-slate-300">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/20">
                    <td className="py-4 font-semibold text-white flex items-center">
                      <Shield className="h-4 w-4 mr-2 text-indigo-500 shrink-0" />
                      {log.profile_name}
                    </td>
                    <td className="py-4 font-mono text-[11px] text-indigo-400 font-semibold">{log.action}</td>
                    <td className="py-4 text-slate-300 max-w-xs sm:max-w-md truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="py-4 font-mono text-slate-500">{log.ip_address}</td>
                    <td className="py-4 text-slate-400 flex items-center">
                      <Calendar className="h-4 w-4 mr-1.5 text-slate-600 shrink-0" />
                      {new Date(log.created_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <History className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">ไม่พบบันทึกการใช้งานระบบตามเงื่อนไข</p>
          </div>
        )}
      </div>
    </div>
  );
}
