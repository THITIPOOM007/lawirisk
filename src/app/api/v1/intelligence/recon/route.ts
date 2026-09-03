import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { buildCaseIntelligenceSearchResult, buildCaseReconSummary, caseIntelligenceRequestSchema } from '@/lib/case-intelligence';
import {
  addAuditLog,
  getCases,
  getEntities,
  getEvidence,
  getMatches,
  getRelationships,
  INITIAL_MENTIONS,
  INITIAL_RELATIONSHIP_REFERENCES,
} from '@/lib/demo-data';
import { mapTrustedSourceRows, searchOfficialHssPublicNews, searchOfficialOryorNews } from '@/lib/fda-smart-resolver';
import { searchGroundedPublicWeb } from '@/lib/providers/gemini-grounded-search';
import { consumeRateLimit } from '@/lib/rate-limit';
import { buildReconAutomationPlan } from '@/lib/recon-automation';
import { classifyCaseSourceScope, recommendCaseSources } from '@/lib/case-source-scope';
import { CASE_WRITE_ROLES } from '@/lib/roles';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { createServer } from '@/lib/supabase-server';

const usableEvidenceStatuses = new Set(['CLEAN', 'NOT_SCANNED']);

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, CASE_WRITE_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ใช้การสืบค้นข้อมูลเชิงลึก');
  if (!hasTrustedBrowserOrigin(request)) {
    return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403);
  }
  const parsed = caseIntelligenceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 'รหัสสำนวนคดีไม่ถูกต้อง', 400);

  if (auth.identity.mode === 'demo') {
    const caseRecord = getCases().find((item) => item.id === parsed.data.case_id);
    if (!caseRecord) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
    const caseEvidence = getEvidence().filter((item) => item.case_id === caseRecord.id);
    const caseEntities = getEntities().filter((item) => item.case_id === caseRecord.id);
    const entityById = new Map(caseEntities.map((item) => [item.id, item]));
    const evidenceById = new Map(caseEvidence.map((item) => [item.id, item]));
    const verifiedFacts = caseEntities.flatMap((entity) => INITIAL_MENTIONS
      .filter((mention) => mention.entity_id === entity.id)
      .flatMap((mention) => {
        const evidence = caseEvidence.find((item) => item.filename === mention.filename && usableEvidenceStatuses.has(item.malware_scan_status || ''));
        return evidence ? [{
          id: mention.id,
          entityType: entity.type,
          value: entity.value,
          evidenceId: evidence.id,
          filename: evidence.filename,
          pageNumber: mention.page_number,
          snippet: mention.snippet,
          sha256: evidence.sha256,
        }] : [];
      }));
    const caseRelationships = getRelationships().filter((item) => item.case_id === caseRecord.id && item.status === 'VERIFIED');
    const verifiedRelationships = caseRelationships.flatMap((relationship) => INITIAL_RELATIONSHIP_REFERENCES
      .filter((reference) => reference.relationship_id === relationship.id)
      .flatMap((reference) => {
        const evidence = evidenceById.get(reference.evidence_id);
        const source = entityById.get(relationship.source_entity_id);
        const target = entityById.get(relationship.target_entity_id);
        return evidence && usableEvidenceStatuses.has(evidence.malware_scan_status || '') && source && target ? [{
          id: reference.id,
          relationshipType: relationship.type,
          sourceValue: source.value,
          targetValue: target.value,
          evidenceId: evidence.id,
          filename: evidence.filename,
          pageNumber: reference.page_number,
          quote: reference.quote,
          sha256: evidence.sha256,
        }] : [];
      }));
    const automation = buildReconAutomationPlan({
      caseNumber: caseRecord.number,
      caseContext: `${caseRecord.title} ${caseRecord.description || ''}`,
      candidates: verifiedFacts.map((fact) => ({
        id: fact.id,
        type: fact.entityType,
        value: fact.value,
        basisStatus: 'CONFIRMED' as const,
        evidenceId: fact.evidenceId,
        filename: fact.filename,
        pageNumber: fact.pageNumber,
        confidence: 1,
      })),
    });
    const search = buildCaseIntelligenceSearchResult({
      evidenceInventory: caseEvidence
        .filter((item) => usableEvidenceStatuses.has(item.malware_scan_status || ''))
        .map((item) => ({ id: item.id, filename: item.filename, sha256: item.sha256, safetyStatus: item.malware_scan_status === 'CLEAN' ? 'CLEAN' as const : 'NOT_SCANNED' as const })),
      verifiedFacts,
      verifiedRelationships,
      trustedRegistryFindings: [],
      searchedRegistryTermCount: 0,
      pendingReviewCount: 0,
      registryStatus: 'DEMO',
      publicWebStatus: 'DEMO',
      automationPlan: automation.plan,
      blockedAutomation: automation.blocked,
      sourceRecommendations: recommendCaseSources(`${caseRecord.title} ${caseRecord.description || ''}`),
    });
    const report = buildCaseReconSummary({
      caseId: caseRecord.id,
      caseNumber: caseRecord.number,
      caseTitle: caseRecord.title,
      evidenceCount: caseEvidence.length,
      entityCount: caseEntities.length,
      verifiedRelationshipCount: caseRelationships.length,
      crossCaseMatchCount: getMatches().filter((item) => item.source_case_id === caseRecord.id || item.target_case_id === caseRecord.id).length,
    });
    addAuditLog(auth.identity.name, 'CASE_INTELLIGENCE_SEARCH', `ค้นข้อมูลที่มีแหล่งอ้างอิงในสำนวน ${caseRecord.number}`);
    return NextResponse.json({ data: { report, search } }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const supabase = await createServer();
  const limit = await consumeRateLimit({
    client: supabase,
    key: `case-intelligence:${auth.identity.id}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'เรียกตรวจข้อมูลถี่เกินไป กรุณารอสักครู่' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!z.string().uuid().safeParse(parsed.data.case_id).success) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดี', 404);
  const caseId = parsed.data.case_id;
  const [caseResult, evidenceResult, entitiesResult, relationshipsResult, matchesResult, suggestionsResult, intakeChecksResult] = await Promise.all([
    supabase.from('cases').select('id,number,title,description').eq('id', caseId).maybeSingle(),
    supabase.from('evidence_files').select('id,filename,sha256,malware_scan_status', { count: 'exact' }).eq('case_id', caseId).eq('upload_state', 'STORED').in('malware_scan_status', ['CLEAN', 'NOT_SCANNED']),
    supabase.from('extracted_entities').select('id,type,value', { count: 'exact' }).eq('case_id', caseId).order('created_at', { ascending: false }).limit(200),
    supabase.from('entity_relationships').select('id,source_entity_id,target_entity_id,type,status', { count: 'exact' }).eq('case_id', caseId).eq('status', 'VERIFIED').limit(200),
    supabase.from('match_candidates').select('*', { count: 'exact', head: true }).or(`source_case_id.eq.${caseId},target_case_id.eq.${caseId}`),
    supabase.from('extraction_suggestions')
      .select('id,evidence_id,page_number,entity_type,candidate_value,confidence,status', { count: 'exact' })
      .eq('case_id', caseId)
      .in('status', ['SUGGESTED', 'UNCERTAIN'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('intake_source_checks')
      .select('id,source_label,source_url,query_text,source_category,status,summary,results,checked_at')
      .eq('case_id', caseId)
      .order('checked_at', { ascending: false })
      .limit(50),
  ]);
  if (caseResult.error || !caseResult.data) return apiError('CASE_NOT_FOUND', 'ไม่พบสำนวนคดีหรือไม่มีสิทธิ์เข้าถึง', 404);
  if (evidenceResult.error || entitiesResult.error || relationshipsResult.error || matchesResult.error || suggestionsResult.error || intakeChecksResult.error) {
    return apiError('INTELLIGENCE_WORKSPACE_FAILED', 'รวบรวมสถานะข้อมูลคดีไม่สำเร็จ', 503);
  }

  const evidenceRows = evidenceResult.data || [];
  const entityRows = entitiesResult.data || [];
  const relationshipRows = relationshipsResult.data || [];
  const intakeSourceCategories = [...new Set((intakeChecksResult.data || []).map((item) => item.source_category).filter(Boolean))];
  const caseRoutingContext = `${caseResult.data.title} ${caseResult.data.description || ''} ${intakeSourceCategories.join(' ')}`;
  const evidenceIds = evidenceRows.map((item) => item.id);
  const entityIds = entityRows.map((item) => item.id);
  const relationshipIds = relationshipRows.map((item) => item.id);
  const [pagesResult, mentionsResult, referencesResult] = await Promise.all([
    evidenceIds.length
      ? supabase.from('evidence_pages').select('id,evidence_id,page_number').in('evidence_id', evidenceIds).limit(1_000)
      : Promise.resolve({ data: [], error: null }),
    entityIds.length
      ? supabase.from('entity_mentions').select('id,entity_id,page_id,snippet,confidence').in('entity_id', entityIds).limit(1_000)
      : Promise.resolve({ data: [], error: null }),
    relationshipIds.length
      ? supabase.from('relationship_references').select('id,relationship_id,evidence_id,page_number,quote').in('relationship_id', relationshipIds).limit(1_000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (pagesResult.error || mentionsResult.error || referencesResult.error) {
    return apiError('INTELLIGENCE_SOURCE_TRACE_FAILED', 'รวบรวมแหล่งอ้างอิงของผลค้นไม่สำเร็จ', 503);
  }

  const evidenceById = new Map(evidenceRows.map((item) => [item.id, item]));
  const entityById = new Map(entityRows.map((item) => [item.id, item]));
  const pageById = new Map((pagesResult.data || []).map((item) => [item.id, item]));
  const verifiedFacts = (mentionsResult.data || []).flatMap((mention) => {
    const entity = entityById.get(mention.entity_id);
    const page = pageById.get(mention.page_id);
    const evidence = page ? evidenceById.get(page.evidence_id) : undefined;
    if (!entity || !page || !evidence || !usableEvidenceStatuses.has(evidence.malware_scan_status) || !mention.snippet) return [];
    return [{
      id: mention.id,
      entityType: entity.type,
      value: entity.value,
      evidenceId: evidence.id,
      filename: evidence.filename,
      pageNumber: page.page_number,
      snippet: mention.snippet,
      sha256: evidence.sha256,
    }];
  });
  const cleanSourcedEntityIds = new Set((mentionsResult.data || []).flatMap((mention) => {
    const page = pageById.get(mention.page_id);
    const evidence = page ? evidenceById.get(page.evidence_id) : undefined;
    return evidence && usableEvidenceStatuses.has(evidence.malware_scan_status) && mention.snippet ? [mention.entity_id] : [];
  }));
  const verifiedRelationships = (referencesResult.data || []).flatMap((reference) => {
    const relationship = relationshipRows.find((item) => item.id === reference.relationship_id);
    const evidence = evidenceById.get(reference.evidence_id);
    const source = relationship ? entityById.get(relationship.source_entity_id) : undefined;
    const target = relationship ? entityById.get(relationship.target_entity_id) : undefined;
    if (!relationship || !evidence || !usableEvidenceStatuses.has(evidence.malware_scan_status) || !source || !target || !reference.quote) return [];
    return [{
      id: reference.id,
      relationshipType: relationship.type,
      sourceValue: source.value,
      targetValue: target.value,
      evidenceId: evidence.id,
      filename: evidence.filename,
      pageNumber: reference.page_number,
      quote: reference.quote,
      sha256: evidence.sha256,
    }];
  });

  const confirmedPlanCandidates = verifiedFacts.map((fact) => ({
    id: fact.id,
    type: fact.entityType,
    value: fact.value,
    basisStatus: 'CONFIRMED' as const,
    evidenceId: fact.evidenceId,
    filename: fact.filename,
    pageNumber: fact.pageNumber,
    confidence: 1,
  }));
  const suggestedPlanCandidates = (suggestionsResult.data || []).flatMap((suggestion) => {
    const evidence = evidenceById.get(suggestion.evidence_id);
    if (!evidence || !usableEvidenceStatuses.has(evidence.malware_scan_status)) return [];
    return [{
      id: suggestion.id,
      type: suggestion.entity_type,
      value: suggestion.candidate_value,
      basisStatus: suggestion.status as 'SUGGESTED' | 'UNCERTAIN',
      evidenceId: evidence.id,
      filename: evidence.filename,
      pageNumber: suggestion.page_number,
      confidence: suggestion.confidence,
    }];
  });
  const automation = buildReconAutomationPlan({
    caseNumber: caseResult.data.number,
    caseContext: caseRoutingContext,
    candidates: [...confirmedPlanCandidates, ...suggestedPlanCandidates],
  });

  const registryEligibleTypes = new Set(['ORGANIZATION', 'PHONE', 'EMAIL', 'LOCATION', 'PRODUCT_NAME', 'REGISTRATION_NUMBER', 'LICENSE_NUMBER']);
  const verifiedRegistryTerms = entityRows
    .filter((entity) => registryEligibleTypes.has(entity.type) && cleanSourcedEntityIds.has(entity.id))
    .map((entity) => entity.value.trim())
    .filter((value) => value.length >= 2 && value.length <= 200);
  const suggestedRegistryTerms = (suggestionsResult.data || [])
    .filter((suggestion) => registryEligibleTypes.has(suggestion.entity_type) && (suggestion.confidence || 0) >= 0.8 && usableEvidenceStatuses.has(evidenceById.get(suggestion.evidence_id)?.malware_scan_status || ''))
    .map((suggestion) => suggestion.candidate_value.trim())
    .filter((value) => value.length >= 2 && value.length <= 200);
  const registryTerms = [...new Set([...verifiedRegistryTerms, ...suggestedRegistryTerms])].slice(0, 8);
  const sourceRecommendations = recommendCaseSources(caseRoutingContext);
  const sourceCategory = classifyCaseSourceScope(caseRoutingContext);
  const [registryResponses, groundedWeb, officialNewsResults] = await Promise.all([
    Promise.all(registryTerms.map(async (term) => {
      const result = await supabase.rpc('search_trusted_sources', { search_query: term, max_results: 5 });
      return { data: result.data, error: result.error };
    })),
    searchGroundedPublicWeb(registryTerms, { label: sourceCategory, urls: sourceRecommendations.map((item) => item.url) }),
    Promise.all(registryTerms.slice(0, 4).flatMap((term) => [
      searchOfficialHssPublicNews(term),
      searchOfficialOryorNews(term),
    ])).then((groups) => groups.flat()),
  ]);
  const registryUnavailable = registryResponses.some((result) => Boolean(result.error));
  const registryFindingsById = new Map<string, ReturnType<typeof mapTrustedSourceRows>[number]>();
  for (const response of registryResponses) {
    for (const finding of mapTrustedSourceRows(response.data)) registryFindingsById.set(finding.id, finding);
  }
  const trustedRegistryFindings = [...registryFindingsById.values()].map((item) => ({
    id: item.id,
    title: item.title,
    snippet: item.snippet,
    source: item.source,
    sourceUrl: item.sourceUrl,
    publishedDate: item.publishedDate,
  }));
  for (const check of intakeChecksResult.data || []) {
    if (check.status !== 'FOUND' || !Array.isArray(check.results)) continue;
    for (const raw of check.results.slice(0, 10)) {
      if (!raw || typeof raw !== 'object') continue;
      const result = raw as Record<string, unknown>;
      const title = typeof result.title === 'string' ? result.title : '';
      const snippet = typeof result.snippet === 'string' ? result.snippet : check.summary;
      if (!title || !snippet) continue;
      trustedRegistryFindings.push({
        id: typeof result.id === 'string' ? `intake:${check.id}:${result.id}` : `intake:${check.id}:${trustedRegistryFindings.length}`,
        title,
        snippet,
        source: check.source_label,
        sourceUrl: check.source_url,
        publishedDate: check.checked_at,
      });
    }
  }
  const publicWebFindingsBySource = new Map<string, { id: string; title: string; snippet: string; source: string; sourceUrl: string; publishedDate: string }>();
  for (const item of officialNewsResults) {
    publicWebFindingsBySource.set(`${item.sourceUrl}|${item.title}`, {
      id: `official-news:${item.id}`,
      title: item.title,
      snippet: item.snippet,
      source: item.source,
      sourceUrl: item.sourceUrl,
      publishedDate: item.publishedDate,
    });
  }
  for (const item of groundedWeb.findings) {
    publicWebFindingsBySource.set(`${item.sourceUrl}|${item.title}`, {
      id: item.id, title: item.title, snippet: item.snippet, source: item.source,
      sourceUrl: item.sourceUrl, publishedDate: item.publishedDate,
    });
  }
  const groundedWebFindings = [...publicWebFindingsBySource.values()].map((item) => ({
    id: item.id, title: item.title, snippet: item.snippet, source: item.source,
    sourceUrl: item.sourceUrl, publishedDate: item.publishedDate,
  }));
  const search = buildCaseIntelligenceSearchResult({
    evidenceInventory: evidenceRows
      .filter((item) => usableEvidenceStatuses.has(item.malware_scan_status))
      .map((item) => ({ id: item.id, filename: item.filename, sha256: item.sha256, safetyStatus: item.malware_scan_status === 'CLEAN' ? 'CLEAN' as const : 'NOT_SCANNED' as const })),
    verifiedFacts,
    verifiedRelationships,
    trustedRegistryFindings,
    searchedRegistryTermCount: registryTerms.length,
    pendingReviewCount: suggestionsResult.count || 0,
    registryStatus: registryTerms.length === 0 ? 'NO_ELIGIBLE_TERMS' : registryUnavailable ? 'UNAVAILABLE' : 'SEARCHED',
    groundedWebFindings,
    publicWebQueryCount: groundedWeb.queryCount + Math.min(registryTerms.length, 4),
    publicWebTokenUsage: groundedWeb.tokenUsage,
    publicWebStatus: officialNewsResults.length > 0 ? 'SEARCHED' : groundedWeb.status,
    automationPlan: automation.plan,
    blockedAutomation: automation.blocked,
    sourceRecommendations,
  });

  const report = buildCaseReconSummary({
    caseId: caseResult.data.id,
    caseNumber: caseResult.data.number,
    caseTitle: caseResult.data.title,
    evidenceCount: evidenceResult.count || 0,
    entityCount: entitiesResult.count || 0,
    verifiedRelationshipCount: relationshipsResult.count || 0,
    crossCaseMatchCount: matchesResult.count || 0,
  });
  const audit = await supabase.from('audit_logs').insert({
    profile_id: auth.identity.id,
    action: 'CASE_INTELLIGENCE_SEARCH',
    details: {
      case_id: caseId,
      credentialed_external_queries_performed: false,
      trusted_registry_queries_performed: registryTerms.length,
      verified_findings: search.verifiedFindingCount,
      trusted_registry_findings: search.registryFindingCount,
      grounded_public_web_queries_performed: search.publicWebQueryCount,
      grounded_public_web_findings: search.publicWebFindingCount,
      deterministic_official_news_findings: officialNewsResults.length,
      grounded_public_web_token_usage: search.publicWebTokenUsage,
      local_automation_queries_planned: automation.plan.length,
      local_automation_queries_blocked: automation.blocked.length,
    },
  });
  if (audit.error) return apiError('AUDIT_WRITE_FAILED', 'บันทึกการเปิด workspace ไม่สำเร็จ', 503);
  return NextResponse.json({ data: { report, search } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
