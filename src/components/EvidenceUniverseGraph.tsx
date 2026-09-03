'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import {
  Box,
  ChevronRight,
  Focus,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Waypoints,
  X,
} from 'lucide-react';

export interface UniverseNode {
  id: string;
  group: string;
  label: string;
  val: number;
  caseId?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface UniverseLink {
  source: string | UniverseNode;
  target: string | UniverseNode;
  label?: string;
}

export interface UniverseGraphData {
  nodes: UniverseNode[];
  links: UniverseLink[];
}

type OrbitControlsLike = {
  autoRotate?: boolean;
  autoRotateSpeed?: number;
};

const GROUP_META: Record<string, { label: string; color: string; short: string }> = {
  case: { label: 'สำนวนคดี', color: '#42e8ce', short: 'คดี' },
  evidence: { label: 'หลักฐานดิจิทัล', color: '#38bdf8', short: 'หลักฐาน' },
  PERSON: { label: 'บุคคล', color: '#ffc56f', short: 'บุคคล' },
  ORGANIZATION: { label: 'นิติบุคคล/องค์กร', color: '#a78bfa', short: 'องค์กร' },
  PHONE: { label: 'หมายเลขโทรศัพท์', color: '#8b8cff', short: 'โทรศัพท์' },
  BANK_ACCOUNT: { label: 'บัญชีธนาคาร', color: '#fb7185', short: 'บัญชี' },
  LOCATION: { label: 'สถานที่', color: '#34d399', short: 'สถานที่' },
  EMAIL: { label: 'อีเมล', color: '#f472b6', short: 'อีเมล' },
  CITIZEN_ID: { label: 'เลขประจำตัว', color: '#facc15', short: 'เลขประจำตัว' },
};

const fallbackMeta = { label: 'ข้อมูลอื่น', color: '#e2e8f0', short: 'ข้อมูล' };
const getMeta = (group: string) => GROUP_META[group] || fallbackMeta;
const endpointId = (endpoint: string | UniverseNode) => typeof endpoint === 'string' ? endpoint : endpoint.id;
const isAutomaticMapping = (link: UniverseLink) => link.label?.startsWith('mapping อัตโนมัติ') || false;
const isVerifiedMapping = (link: UniverseLink) => link.label === 'รับรองความเชื่อมโยง' || link.label === 'ยืนยันความเชื่อมโยง';

export default function EvidenceUniverseGraph({ data }: { data: UniverseGraphData }) {
  const fgRef = useRef<ForceGraphMethods<UniverseNode, UniverseLink> | undefined>(undefined);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 650 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<2 | 3>(2);
  const [motionEnabled, setMotionEnabled] = useState(() => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [autoRotate, setAutoRotate] = useState(false);
  const availableGroups = useMemo(() => Array.from(new Set(data.nodes.map((node) => node.group))), [data.nodes]);
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(() => new Set(data.nodes.map((node) => node.group)));

  useEffect(() => {
    const element = graphContainerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(520, Math.floor(entry.contentRect.height));
      setDimensions({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const controls = fgRef.current?.controls() as OrbitControlsLike | undefined;
      if (!controls) return;
      controls.autoRotate = autoRotate && viewMode === 3;
      controls.autoRotateSpeed = 0.65;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoRotate, viewMode]);

  const nodeById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const linksByNode = useMemo(() => {
    const map = new Map<string, UniverseLink[]>();
    for (const link of data.links) {
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      map.set(source, [...(map.get(source) || []), link]);
      map.set(target, [...(map.get(target) || []), link]);
    }
    return map;
  }, [data.links]);
  const selectedNode = selectedId ? nodeById.get(selectedId) || null : null;
  const selectedLinks = selectedId ? linksByNode.get(selectedId) || [] : [];
  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedId) return ids;
    ids.add(selectedId);
    for (const link of linksByNode.get(selectedId) || []) {
      ids.add(endpointId(link.source));
      ids.add(endpointId(link.target));
    }
    return ids;
  }, [linksByNode, selectedId]);

  const normalizedQuery = query.trim().toLocaleLowerCase('th-TH');
  const searchResults = useMemo(() => normalizedQuery
    ? data.nodes.filter((node) => visibleGroups.has(node.group) && node.label.toLocaleLowerCase('th-TH').includes(normalizedQuery)).slice(0, 7)
    : [], [data.nodes, normalizedQuery, visibleGroups]);

  const isNodeVisible = useCallback((node: UniverseNode) => visibleGroups.has(node.group), [visibleGroups]);
  const isLinkVisible = useCallback((link: UniverseLink) => {
    const source = nodeById.get(endpointId(link.source));
    const target = nodeById.get(endpointId(link.target));
    return Boolean(source && target && visibleGroups.has(source.group) && visibleGroups.has(target.group));
  }, [nodeById, visibleGroups]);
  const isLinkEmphasized = useCallback((link: UniverseLink) => Boolean(selectedId && (
    endpointId(link.source) === selectedId || endpointId(link.target) === selectedId
  )), [selectedId]);

  const nodeColor = useCallback((node: UniverseNode) => {
    const base = getMeta(node.group).color;
    if (selectedId && !connectedIds.has(node.id)) return '#253345';
    if (normalizedQuery && !node.label.toLocaleLowerCase('th-TH').includes(normalizedQuery)) return '#334155';
    if (node.id === selectedId || node.id === hoveredId) return '#ffffff';
    return base;
  }, [connectedIds, hoveredId, normalizedQuery, selectedId]);

  const focusNode = useCallback((node: UniverseNode) => {
    setSelectedId(node.id);
    setQuery('');
    const x = node.x || 0;
    const y = node.y || 0;
    const z = node.z || 0;
    if (viewMode === 2) {
      fgRef.current?.cameraPosition({ x, y, z: 108 }, { x, y, z: 0 }, 450);
      return;
    }
    const magnitude = Math.hypot(x, y, z) || 1;
    const distanceRatio = 1 + 82 / magnitude;
    fgRef.current?.cameraPosition(
      { x: x * distanceRatio, y: y * distanceRatio, z: z * distanceRatio },
      { x, y, z },
      450,
    );
  }, [viewMode]);

  const fitGraph = useCallback(() => {
    fgRef.current?.zoomToFit(500, 76, isNodeVisible);
  }, [isNodeVisible]);

  const changeViewMode = (nextMode: 2 | 3) => {
    setViewMode(nextMode);
    if (nextMode === 2) setAutoRotate(false);
    window.setTimeout(() => {
      fgRef.current?.d3ReheatSimulation();
      fgRef.current?.zoomToFit(550, 80, isNodeVisible);
    }, 80);
  };

  const toggleGroup = (group: string) => {
    if (visibleGroups.has(group) && visibleGroups.size > 1 && selectedNode?.group === group) {
      setSelectedId(null);
    }
    setVisibleGroups((current) => {
      const next = new Set(current);
      if (next.has(group) && next.size > 1) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const resetView = () => {
    setSelectedId(null);
    setQuery('');
    setVisibleGroups(new Set(availableGroups));
    setViewMode(2);
    setAutoRotate(false);
    window.setTimeout(() => {
      fgRef.current?.d3ReheatSimulation();
      fgRef.current?.zoomToFit(500, 76);
    }, 80);
  };

  const relatedNodes = selectedNode ? selectedLinks.map((link) => {
    const otherId = endpointId(link.source) === selectedNode.id ? endpointId(link.target) : endpointId(link.source);
    return { link, node: nodeById.get(otherId) };
  }).filter((item): item is { link: UniverseLink; node: UniverseNode } => Boolean(item.node && visibleGroups.has(item.node.group))) : [];

  return (
    <div className="space-y-3">
      <div className="glass-panel relative z-40 overflow-visible rounded-2xl border border-white/[0.07] p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative z-50 min-w-0 flex-1 xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <label htmlFor="universe-search" className="sr-only">ค้นหาโหนดในผังความเชื่อมโยง</label>
            <input id="universe-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาคดี บุคคล เบอร์โทร หรือชื่อหลักฐาน…" className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-[#06111d]/90 pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus:border-teal-300/35 focus:outline-none" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="ล้างคำค้น" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-white"><X className="h-3.5 w-3.5" /></button>}
            {searchResults.length > 0 && (
              <div className="absolute inset-x-0 top-[calc(100%+6px)] z-[70] max-h-[min(24rem,55vh)] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#071421]/98 p-1 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
                {searchResults.map((node) => <button key={node.id} type="button" onClick={() => focusNode(node)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMeta(node.group).color }} /><span className="truncate">{node.label}</span><ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-600" /></button>)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/[0.08] bg-[#06111d]/80 p-1" aria-label="เลือกรูปแบบมิติ">
              <button type="button" onClick={() => changeViewMode(2)} aria-pressed={viewMode === 2} className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${viewMode === 2 ? 'bg-teal-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}>อ่านง่าย 2D</button>
              <button type="button" onClick={() => changeViewMode(3)} aria-pressed={viewMode === 3} className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${viewMode === 3 ? 'bg-indigo-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}>3D เต็มรูปแบบ</button>
            </div>
            <button type="button" onClick={fitGraph} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs text-slate-300 hover:border-teal-300/25 hover:text-white" title="จัดทุกโหนดให้อยู่ในจอ"><Focus className="h-4 w-4" />พอดีจอ</button>
            <button type="button" onClick={() => setMotionEnabled((value) => !value)} aria-pressed={motionEnabled} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs ${motionEnabled ? 'border-sky-300/25 bg-sky-300/[0.06] text-sky-200' : 'border-white/[0.08] text-slate-400'}`}>{motionEnabled ? <Sparkles className="h-4 w-4" /> : <Pause className="h-4 w-4" />}แสงเชื่อมโยง</button>
            <button type="button" onClick={resetView} className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] text-slate-400 hover:text-white" aria-label="คืนค่ามุมมอง"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="ตัวกรองประเภทข้อมูล">
          {availableGroups.map((group) => {
            const meta = getMeta(group);
            const active = visibleGroups.has(group);
            const count = data.nodes.filter((node) => node.group === group).length;
            return <button key={group} type="button" onClick={() => toggleGroup(group)} aria-pressed={active} className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-[10px] font-medium transition ${active ? 'border-white/[0.14] bg-white/[0.055] text-slate-200' : 'border-white/[0.05] text-slate-600 opacity-60'}`}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? meta.color : '#475569' }} />{meta.short}<span className="text-slate-600">{count}</span></button>;
          })}
        </div>
      </div>

      <div className="relative z-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={graphContainerRef} role="img" aria-label="ผังความเชื่อมโยงแบบโต้ตอบ ใช้เมาส์ลากเพื่อหมุน เลื่อนเพื่อซูม และคลิกโหนดเพื่อดูรายละเอียด" className="relative h-[66vh] min-h-[580px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_50%_35%,#0b2131_0%,#040b14_52%,#02070d_100%)]">
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#020914]/75 px-3 py-1.5 text-[10px] text-slate-400 backdrop-blur-lg"><Waypoints className="h-3.5 w-3.5 text-teal-300" />คลิกโหนดเพื่อซูมภายใน 0.45 วินาที</div>
          {viewMode === 3 && <button type="button" onClick={() => setAutoRotate((value) => !value)} className="absolute right-3 top-3 z-20 inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/[0.09] bg-[#020914]/80 px-3 text-[10px] text-slate-300 backdrop-blur-lg" aria-pressed={autoRotate}>{autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{autoRotate ? 'หยุดหมุน' : 'หมุนอัตโนมัติ'}</button>}
          <ForceGraph3D<UniverseNode, UniverseLink>
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={data}
            nodeId="id"
            nodeLabel="label"
            nodeVisibility={isNodeVisible}
            nodeColor={nodeColor}
            nodeVal={(node) => node.val * (node.id === selectedId ? 1.8 : connectedIds.has(node.id) ? 1.2 : 1)}
            nodeRelSize={4.5}
            nodeOpacity={0.96}
            nodeResolution={14}
            onNodeClick={(node) => focusNode(node)}
            onNodeHover={(node) => setHoveredId(node?.id || null)}
            onBackgroundClick={() => setSelectedId(null)}
            linkLabel={(link) => link.label || 'ความเชื่อมโยง'}
            linkVisibility={isLinkVisible}
            linkColor={(link) => isLinkEmphasized(link) ? '#67e8f9' : isVerifiedMapping(link) ? '#34d399' : isAutomaticMapping(link) ? '#818cf8' : '#334e63'}
            linkWidth={(link) => isLinkEmphasized(link) ? 3.4 : isVerifiedMapping(link) ? 2.1 : isAutomaticMapping(link) ? 1.5 : 0.8}
            linkOpacity={0.78}
            linkCurvature={(link) => isVerifiedMapping(link) || isAutomaticMapping(link) ? 0.18 : 0.06}
            linkDirectionalArrowLength={(link) => isLinkEmphasized(link) ? 5 : isVerifiedMapping(link) || isAutomaticMapping(link) ? 3 : 0}
            linkDirectionalArrowColor={(link) => isLinkEmphasized(link) ? '#a5f3fc' : '#64748b'}
            linkDirectionalParticles={(link) => !motionEnabled ? 0 : isLinkEmphasized(link) ? 6 : isVerifiedMapping(link) || isAutomaticMapping(link) ? 3 : 1}
            linkDirectionalParticleSpeed={(link) => isLinkEmphasized(link) ? 0.014 : 0.006}
            linkDirectionalParticleWidth={(link) => isLinkEmphasized(link) ? 3.2 : 1.3}
            linkDirectionalParticleColor={(link) => isLinkEmphasized(link) ? '#ffffff' : '#38bdf8'}
            numDimensions={viewMode}
            d3VelocityDecay={0.38}
            warmupTicks={60}
            cooldownTicks={140}
            backgroundColor="rgba(0,0,0,0)"
            showNavInfo={false}
            showPointerCursor
          />
        </div>

        <aside className="glass-panel min-h-[260px] rounded-2xl border border-white/[0.07] p-4" aria-live="polite">
          {selectedNode ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border" style={{ color: getMeta(selectedNode.group).color, borderColor: `${getMeta(selectedNode.group).color}55`, backgroundColor: `${getMeta(selectedNode.group).color}12` }}><Box className="h-5 w-5" /></span>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="ปิดรายละเอียด" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: getMeta(selectedNode.group).color }}>{getMeta(selectedNode.group).label}</p>
              <h2 className="mt-2 break-words text-base font-semibold leading-6 text-white">{selectedNode.label}</h2>
              <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[9px] text-slate-600">ความเชื่อมโยง</p><p className="mt-1 text-lg font-bold text-teal-200">{relatedNodes.length}</p></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[9px] text-slate-600">ขนาดโหนด</p><p className="mt-1 text-lg font-bold text-slate-200">{selectedNode.val}</p></div></div>
              <div className="mt-5"><h3 className="text-xs font-semibold text-slate-300">เชื่อมโยงโดยตรง</h3>{relatedNodes.length ? <div className="mt-2 space-y-1.5">{relatedNodes.map(({ link, node }) => <button key={`${selectedNode.id}-${node.id}`} type="button" onClick={() => focusNode(node)} className="group flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 text-left hover:border-teal-300/20 hover:bg-teal-300/[0.035]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMeta(node.group).color }} /><span className="min-w-0 flex-1"><span className="block truncate text-xs text-slate-200">{node.label}</span><span className="mt-0.5 block text-[9px] text-slate-600">{link.label || 'ความเชื่อมโยง'}</span></span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-teal-300" /></button>)}</div> : <p className="mt-2 text-xs text-slate-600">ไม่พบโหนดที่เชื่อมโดยตรงในตัวกรองปัจจุบัน</p>}</div>
            </div>
          ) : (
            <div className="flex min-h-[250px] flex-col items-center justify-center px-3 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-teal-300/15 bg-teal-300/[0.05] text-teal-300"><Orbit className="h-6 w-6" /></span><h2 className="mt-4 text-sm font-semibold text-white">เลือกจุดที่ต้องการตรวจสอบ</h2><p className="mt-2 text-xs leading-5 text-slate-500">คลิกโหนดในผัง ระบบจะซูมให้ทันทีและแสดงรายการความเชื่อมโยงแบบอ่านง่ายตรงนี้</p><button type="button" onClick={fitGraph} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs text-slate-300"><Focus className="h-4 w-4" />แสดงภาพรวมทั้งหมด</button></div>
          )}
        </aside>
      </div>
    </div>
  );
}
