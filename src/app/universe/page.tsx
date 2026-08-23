'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, Network, RefreshCw } from 'lucide-react';
import type { UniverseGraphData } from '@/components/EvidenceUniverseGraph';

const EvidenceUniverseGraph = dynamic(() => import('@/components/EvidenceUniverseGraph'), { ssr: false });

export default function UniversePage() {
  const [data, setData] = useState<UniverseGraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/universe', { credentials: 'same-origin' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message || 'ระบบไม่สามารถโหลดข้อมูลผังความเชื่อมโยงได้');
      }
      setData(body.data);
      setSource(body.meta?.source || 'ข้อมูลตามสิทธิ์ของผู้ใช้');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'โหลดผังความเชื่อมโยงไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadGraph());
  }, [loadGraph]);

  return (
    <div className="space-y-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold text-white">ผังความเชื่อมโยงพยานหลักฐาน 3 มิติ (3D Evidence Graph)</h1>
        <p className="text-sm text-slate-400 mt-1">
          แสดงภาพรวมความสัมพันธ์ระหว่างสำนวนคดี บุคคล บัญชีธนาคาร และพยานหลักฐานดิจิทัลทั้งระบบในรูปแบบโครงข่าย 3 มิติ
        </p>
        </div>
        {!loading && !error && <span className="rounded-full border border-teal-300/20 bg-teal-300/[0.06] px-3 py-1.5 text-[10px] text-teal-100">{source} · {data.nodes.length} โหนด · {data.links.length} เส้นเชื่อม</span>}
      </div>

      <div className="relative min-h-[620px]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="skeleton-shimmer w-full h-full" />
          </div>
        ) : error ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-400/[0.08] text-rose-300"><AlertTriangle className="h-6 w-6" /></span>
            <h2 className="mt-4 text-lg font-semibold text-white">เปิดผังความเชื่อมโยงไม่สำเร็จ</h2>
            <p className="mt-2 max-w-lg text-sm text-slate-400">{error}</p>
            <button type="button" onClick={() => void loadGraph()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-300 px-4 text-sm font-bold text-slate-950"><RefreshCw className="h-4 w-4" />ลองใหม่</button>
          </div>
        ) : data.nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <Network className="h-10 w-10 text-slate-600" />
            <h2 className="mt-4 text-lg font-semibold text-white">ยังไม่มีข้อมูลสำหรับสร้างผัง</h2>
            <p className="mt-2 text-sm text-slate-500">เพิ่มคดี หลักฐาน หรือข้อมูลที่ตรวจทานแล้วเพื่อเริ่มเห็นความเชื่อมโยง</p>
          </div>
        ) : (
          <EvidenceUniverseGraph data={data} />
        )}
      </div>
    </div>
  );
}
