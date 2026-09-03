import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapGroundedSearchResponse } from './gemini-grounded-search';

function groundedResponse(input: {
  url?: string;
  title?: string;
  snippet?: string;
  chunkIndices?: number[];
}) {
  return {
    candidates: [{
      content: { parts: [{ text: input.snippet || '' }] },
      groundingMetadata: {
        webSearchQueries: ['มิราเคิล คลินิก'],
        groundingChunks: [{ web: { uri: input.url || 'https://hosp.hss.moph.go.th/facility/123', title: input.title || 'มิราเคิล คลินิก' } }],
        groundingSupports: input.snippet === undefined ? [] : [{
          segment: { text: input.snippet },
          groundingChunkIndices: input.chunkIndices || [0],
        }],
      },
    }],
  };
}

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

  it('accepts only a directly matching citation from an approved source host', () => {
    const findings = mapGroundedSearchResponse(groundedResponse({ snippet: 'พบข้อมูล มิราเคิล คลินิก ในทะเบียนของกรมสนับสนุนบริการสุขภาพ' }), 'gemini-test', {
      queryTerms: ['มิราเคิล คลินิก'],
      allowedUrls: ['https://hosp.hss.moph.go.th/'],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.queryTerms).toEqual(['มิราเคิล คลินิก']);
    expect(findings[0]?.snippet).toContain('มิราเคิล คลินิก');
  });

  it('rejects a citation outside the approved source hosts', () => {
    const findings = mapGroundedSearchResponse(groundedResponse({
      url: 'https://untrusted.example/claim',
      snippet: 'พบข้อมูล มิราเคิล คลินิก',
    }), 'gemini-test', {
      queryTerms: ['มิราเคิล คลินิก'],
      allowedUrls: ['https://hosp.hss.moph.go.th/'],
    });
    expect(findings).toEqual([]);
  });

  it('rejects an approved-domain citation with no grounding support', () => {
    const findings = mapGroundedSearchResponse(groundedResponse({}), 'gemini-test', {
      queryTerms: ['มิราเคิล คลินิก'],
      allowedUrls: ['https://hosp.hss.moph.go.th/'],
    });
    expect(findings).toEqual([]);
  });

  it('rejects unrelated grounded text even when the host is approved', () => {
    const findings = mapGroundedSearchResponse(groundedResponse({
      title: 'ประกาศประชาสัมพันธ์ทั่วไป',
      snippet: 'กรมสนับสนุนบริการสุขภาพเผยแพร่กำหนดการประชุมประจำปี',
    }), 'gemini-test', {
      queryTerms: ['มิราเคิล คลินิก'],
      allowedUrls: ['https://hosp.hss.moph.go.th/'],
    });
    expect(findings).toEqual([]);
  });

  it('does not accept lookalike host suffixes', () => {
    const findings = mapGroundedSearchResponse(groundedResponse({
      url: 'https://hosp.hss.moph.go.th.attacker.example/claim',
      snippet: 'พบข้อมูล มิราเคิล คลินิก',
    }), 'gemini-test', {
      queryTerms: ['มิราเคิล คลินิก'],
      allowedUrls: ['https://hosp.hss.moph.go.th/'],
    });
    expect(findings).toEqual([]);
  });

  it('rejects non-standard ports on otherwise approved hosts', () => {
    const findings = mapGroundedSearchResponse(groundedResponse({
      url: 'https://hosp.hss.moph.go.th:8443/claim',
      snippet: 'พบข้อมูล มิราเคิล คลินิก',
    }), 'gemini-test', {
      queryTerms: ['มิราเคิล คลินิก'],
      allowedUrls: ['https://hosp.hss.moph.go.th/'],
    });
    expect(findings).toEqual([]);
  });
});
