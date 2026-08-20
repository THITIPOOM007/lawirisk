'use client';

import React, { useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';

interface Node {
  id: string;
  group: string;
  label: string;
  val: number;
}

interface Link {
  source: string;
  target: string;
  label?: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

export default function EvidenceUniverseGraph({ data }: { data: GraphData }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  // Basic styling based on the dark theme
  const getNodeColor = (node: Node) => {
    switch (node.group) {
      case 'case': return '#42e8ce'; // brand teal
      case 'PERSON': return '#ffc56f'; // amber
      case 'PHONE': return '#8b8cff'; // indigo
      case 'BANK_ACCOUNT': return '#ef4444'; // rose
      default: return '#f2f8f8';
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onNodeClick = useCallback((node: any) => {
    // Aim at node from outside it
    const distance = 40;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);

    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
        node, // lookAt ({ x, y, z })
        3000  // ms transition duration
      );
    }
  }, [fgRef]);

  return (
    <div className="w-full h-[600px] border border-[var(--surface-raised)] rounded-lg overflow-hidden bg-[var(--surface)]">
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeLabel="label"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeColor={getNodeColor as any}
        onNodeClick={onNodeClick}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={() => 0.005}
        backgroundColor="#040b14"
      />
    </div>
  );
}
