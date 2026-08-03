'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, ArrowLeft, Loader2, Save } from 'lucide-react';
import { saveCase } from '@/lib/demo-data';

export default function NewCasePage() {
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Zod validation equivalent (simple rules)
    if (!number.trim() || !title.trim()) {
      setError('กรุณากรอกเลขคดีและชื่อคดีให้ครบถ้วน');
      setIsLoading(false);
      return;
    }

    try {
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };

      const creator = getCookie('mock-auth-name') 
        ? decodeURIComponent(getCookie('mock-auth-name')!) 
        : 'เจ้าหน้าที่สืบสวน';

      // Save using stateful helper
      saveCase({
        id: `case-${Date.now()}`,
        number: number.trim(),
        title: title.trim(),
        description: description.trim(),
        status: 'ACTIVE',
        created_by: creator,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      router.push('/cases');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Back Button and Title */}
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          ย้อนกลับ
        </button>
        
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Briefcase className="h-8 w-8 text-indigo-500 shrink-0" />
            <span>สร้างคดีสืบสวนใหม่</span>
          </h1>
          <p className="mt-2 text-slate-400 text-sm">
            บันทึกแฟ้มคดีใหม่เข้าสู่ระบบ เพื่อเตรียมการสืบสวนคัดแยกหลักฐานดิจิทัลและเชื่อมโยงข้ามคดี
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-2xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Form Card */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="number" className="block text-sm font-semibold text-slate-300">
              เลขคดี / หมายเลขรับเรื่อง <span className="text-red-400">*</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              ระบุเลขรหัสคดีอ้างอิงให้ชัดเจน เช่น ค.123/2569
            </p>
            <div className="mt-2">
              <input
                id="number"
                type="text"
                required
                disabled={isLoading}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g. ค.999/2569"
                className="block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm placeholder:text-slate-700 disabled:opacity-50 transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-semibold text-slate-300">
              ชื่อคดีสืบสวน <span className="text-red-400">*</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              ชื่อสรุปคดีสั้นๆ ที่เข้าใจง่าย
            </p>
            <div className="mt-2">
              <input
                id="title"
                type="text"
                required
                disabled={isLoading}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. คดีบัญชีม้าเครือข่ายลักลอบนำเข้า"
                className="block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm placeholder:text-slate-700 disabled:opacity-50 transition-all duration-200"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-slate-300">
              รายละเอียดคดีและเป้าหมายสืบสวน
            </label>
            <p className="mt-1 text-xs text-slate-500">
              อธิบายรายละเอียด พฤติการณ์คดี หรือเป้าหมายบุคคลที่ต้องการวิเคราะห์
            </p>
            <div className="mt-2">
              <textarea
                id="description"
                rows={5}
                disabled={isLoading}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ระบุพฤติการณ์ย่อ ข้อมูลเบื้องต้นที่ตรวจพบ..."
                className="block w-full rounded-2xl border-0 bg-slate-950 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-sm placeholder:text-slate-700 disabled:opacity-50 transition-all duration-200 resize-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-900/60 flex items-center justify-end space-x-3">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => router.back()}
              className="px-5 py-3 text-sm font-semibold text-slate-400 hover:text-white rounded-2xl hover:bg-slate-900 transition-all cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-5 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 active:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin shrink-0" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 mr-2 shrink-0" />
                  บันทึกข้อมูล
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
