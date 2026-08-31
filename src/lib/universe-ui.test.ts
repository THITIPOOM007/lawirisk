import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const graphSource = fs.readFileSync(path.join(process.cwd(), 'src/components/EvidenceUniverseGraph.tsx'), 'utf8');

describe('evidence universe search layering', () => {
  it('keeps search results above the graph canvas and scrollable', () => {
    expect(graphSource).toContain('glass-panel relative z-40 overflow-visible');
    expect(graphSource).toContain('relative z-50 min-w-0 flex-1');
    expect(graphSource).toContain('z-[70] max-h-[min(24rem,55vh)] overflow-y-auto');
    expect(graphSource).toContain('relative z-0 grid gap-3');
  });
});
