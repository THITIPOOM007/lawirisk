'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const EvidenceUniverseGraph = dynamic(() => import('@/components/EvidenceUniverseGraph'), { ssr: false });

export default function UniversePage() {
  const [data, setData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/universe')
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setData(d.data);
        }
        setLoading(false);
      });
  }, []);

  return (
    <main className="p-6 h-[calc(100vh-64px)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">ผังความเชื่อมโยงพยานหลักฐาน 3 มิติ (3D Evidence Graph)</h1>
        <p className="text-sm text-slate-400 mt-1">
          แสดงภาพรวมความสัมพันธ์ระหว่างสำนวนคดี บุคคล บัญชีธนาคาร และพยานหลักฐานดิจิทัลทั้งระบบในรูปแบบโครงข่าย 3 มิติ
        </p>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden glass-panel relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="skeleton-shimmer w-full h-full" />
          </div>
        ) : (
          <EvidenceUniverseGraph data={data} />
        )}
      </div>
    </main>
  );
}
