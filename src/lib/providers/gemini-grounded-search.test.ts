import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('grounded public web search', () => {
  it('keeps the provider server-only, validates envelopes, allows HTTPS citations, and bounds the search', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/providers/gemini-grounded-search.ts'), 'utf8');
    expect(source).toContain("import 'server-only'");
    expect(source).toContain('responseSchema.safeParse');
    expect(source).toContain("url.protocol === 'https:'");
    expect(source).toContain("tools: [{ google_search: {} }]");
    expect(source).toContain('.slice(0, 6)');
    expect(source).toContain('Never decide identity, guilt, ownership, intent, liability');
  });
});
