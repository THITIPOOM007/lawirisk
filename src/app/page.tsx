'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Globe, ShieldCheck, Database, Activity, Inbox, FolderOpen, AlertCircle, FileText, CheckCircle, TrendingUp, Users } from 'lucide-react';
import { getCases, getIntakeEnvelopes, getAuditLogs, getEntities } from '@/lib/demo-data';

export default function NationalCommandCenter() {
  const [caseCount, setCaseCount] = useState(0);
  const [intakeCount, setIntakeCount] = useState(0);
  const [entitiesCount, setEntitiesCount] = useState(0);
  const [auditLogsCount, setAuditLogsCount] = useState(0);

  useEffect(() => {
    setCaseCount(getCases().length);
    setIntakeCount(getIntakeEnvelopes().length);
    setEntitiesCount(getEntities().length);
    setAuditLogsCount(getAuditLogs().length);
  }, []);

  return (
    <div className="space-y-8">
      {/* Dashboard Welcome Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
          <Activity className="h-8 w-8 text-emerald-400 animate-pulse shrink-0" />
          <span>National Case Intelligence (ศูนย์บัญชาการวิเคราะห์คดีระดับประเทศ)</span>
        </h1>
        <p className="mt-2 text-slate-400">
          ระบบบูรณาการข้อมูลเบาะแสร้องเรียนและพยานหลักฐานดิจิทัลระดับประเทศ สำหรับเจ้าหน้าที่พนักงานสืบสวนและปราบปรามพิเศษ
        </p>
      </div>

      {/* Grid of Key Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-3xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 uppercase font-semibold">คำร้องนำเข้าทุกช่องทาง</span>
            <p className="text-3xl font-black text-indigo-400">{intakeCount} เรื่อง</p>
          </div>
          <Inbox className="h-10 w-10 text-indigo-500/20" />
        </div>

        <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-3xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 uppercase font-semibold">สำนวนคดีสืบสวนทั้งหมด</span>
            <p className="text-3xl font-black text-emerald-400">{caseCount} สำนวน</p>
          </div>
          <FolderOpen className="h-10 w-10 text-emerald-500/20" />
        </div>

        <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-3xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 uppercase font-semibold">ทะเบียนเอนทิตียืนยันตัวตน</span>
            <p className="text-3xl font-black text-amber-400">{entitiesCount} รายการ</p>
          </div>
          <Database className="h-10 w-10 text-amber-500/20" />
        </div>

        <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-3xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 uppercase font-semibold">ประวัติกิจกรรมสารบบ (Audit)</span>
            <p className="text-3xl font-black text-slate-300">{auditLogsCount} แถว</p>
          </div>
          <ShieldCheck className="h-10 w-10 text-slate-500/20" />
        </div>
      </div>

      {/* Main Command Center Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* National Hot Zones and Channels (Left 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-950">
              <h3 className="text-base font-bold text-white flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-indigo-500" />
                สถิติการทับซ้อนและจุดทริกเกอร์ความเชื่อมโยงระดับภูมิภาค
              </h3>
              <span className="text-xs text-slate-500">ข้อมูลอัปเดตเรียลไทม์</span>
            </div>

            {/* Simulated map placeholder with HTML/CSS */}
            <div className="relative h-64 bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-radial-gradient-darkopacity opacity-30"></div>
              <div className="relative text-center space-y-2 z-10">
                <Globe className="h-12 w-12 text-indigo-500/40 mx-auto animate-spin-slow" />
                <p className="text-xs font-bold text-indigo-400 tracking-wider uppercase">การวิเคราะห์พิกัดคดี (Jurisdiction Map)</p>
                <p className="text-[10px] text-slate-500">พิกัดทับซ้อนส่วนใหญ่อยู่ใน: เขตสุขภาพที่ 10 (สสจ.ศรีสะเกษ)</p>
              </div>

              {/* Glowing pins */}
              <div className="absolute top-1/3 left-1/2 h-3.5 w-3.5 bg-rose-500 rounded-full animate-ping"></div>
              <div className="absolute top-1/3 left-1/2 h-3 w-3 bg-rose-600 rounded-full"></div>
              <div className="absolute top-1/2 left-2/5 h-2.5 w-2.5 bg-amber-500 rounded-full animate-pulse"></div>
            </div>

            {/* List of active channels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">สัดส่วนช่องทางเข้า</span>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Kouprey Plus</span>
                    <span className="font-bold text-indigo-400">45%</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>อีเมลหน่วยงาน</span>
                    <span className="font-bold text-sky-400">30%</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>แบบบันทึกโดยเจ้าหน้าที่</span>
                    <span className="font-bold text-amber-400">25%</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">สืบค้นด่วนฐานข้อมูล อย. (CKAN Data API)</span>
                <div className="pt-1">
                  <Link
                    href="/cases"
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white text-xs font-bold rounded-xl transition-all"
                  >
                    สืบค้นข้อมูลใบอนุญาต อย.
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Triage Task Board (Right 1/3) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-950">
              <h3 className="text-base font-bold text-white flex items-center">
                <Users className="h-5 w-5 mr-2 text-indigo-500" />
                คิวจัดแยกเร่งด่วน (Priority Triage)
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="px-2 py-0.5 text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded">CRITICAL</span>
                  <span className="text-[10px] text-slate-500">2 ชั่วโมงที่แล้ว</span>
                </div>
                <p className="text-xs font-bold text-white truncate">ลักลอบเปิดคลินิกจัดฟันแฟชั่นเถื่อน ร้านเมย์ ทันตกรรม</p>
                <div className="pt-2 flex justify-end">
                  <Link href="/intake" className="text-indigo-400 hover:underline text-[10px] font-bold">
                    เข้าตรวจสอบบอร์ดคัดแยก
                  </Link>
                </div>
              </div>

              <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 rounded">HIGH</span>
                  <span className="text-[10px] text-slate-500">4 ชั่วโมงที่แล้ว</span>
                </div>
                <p className="text-xs font-bold text-white truncate">แจ้งเบาะแสน้ำดื่มยี่ห้อ ไอร่า ผลิตไม่มี อย.</p>
                <div className="pt-2 flex justify-end">
                  <Link href="/intake" className="text-indigo-400 hover:underline text-[10px] font-bold">
                    เข้าตรวจสอบบอร์ดคัดแยก
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
