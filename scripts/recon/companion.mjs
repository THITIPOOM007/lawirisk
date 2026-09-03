#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  assertSourceLaunchAllowed,
  buildLocalSearchCandidates,
  isHssResultBoundToQuery,
  parseReconUri,
  resolveFdaPublicSearchContract,
  resolveFdaSearchModel,
  resolveEsta2SearchOption,
  resolveHssSearchFilter,
  safeCompanionMessage,
} from './companion-contract.mjs';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const credentialScript = path.join(scriptDir, 'credential-store.ps1');
const localRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'LawiRisk-SSK');
const localBridgeOrigin = 'http://127.0.0.1:32147';

function powershellArgs(action, source) {
  return ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', credentialScript, '-Action', action, '-Source', source];
}

async function configureCredential(source) {
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', powershellArgs('Set', source), { stdio: 'inherit', windowsHide: false });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('CREDENTIAL_SETUP_FAILED')));
  });
}

async function readCredential(source) {
  try {
    const result = await execFileAsync('powershell.exe', powershellArgs('Get', source), {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 32 * 1024,
    });
    const parsed = JSON.parse(result.stdout);
    if (typeof parsed.username !== 'string' || !parsed.username || typeof parsed.password !== 'string' || !parsed.password) {
      throw new Error('CREDENTIAL_NOT_CONFIGURED');
    }
    return parsed;
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 3) {
      throw new Error('CREDENTIAL_NOT_CONFIGURED');
    }
    if (error instanceof SyntaxError) throw new Error('CREDENTIAL_NOT_CONFIGURED');
    throw error;
  }
}

async function getOrConfigureCredential(source) {
  try {
    return await readCredential(source);
  }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'CREDENTIAL_NOT_CONFIGURED') throw error;
    console.log('ยังไม่มีบัญชีที่เข้ารหัสบนเครื่องนี้ กรุณาตั้งค่าครั้งแรก');
    await configureCredential(source);
    return readCredential(source);
  }
}

async function dismissCookieBanner(page) {
  const rejectAll = page.getByRole('button', { name: 'ปฏิเสธทั้งหมด', exact: true });
  if (await rejectAll.isVisible().catch(() => false)) await rejectAll.click().catch(() => {});
}

async function loginFda(page, credential) {
  await page.goto('https://privus.fda.moph.go.th/FDA_LOGIN2/HOME/SET_STATE?STATE=3', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).hostname === 'privus.fda.moph.go.th' && !await page.locator('#UserName').isVisible().catch(() => false)) {
    console.log('ใช้ SKYNET/Privus session เดิมสำเร็จ');
    return;
  }
  await page.waitForURL((url) => url.hostname === 'connect.egov.go.th', { timeout: 30_000 });
  await dismissCookieBanner(page);
  await page.locator('#UserName').fill(credential.username);
  await page.locator('#MaskedInput').fill(credential.password);
  await page.locator('#btnLogin').click();

  const otp = page.locator('#txtTwoFactorOtpMobile, #txtTwoFactorOtpEmail');
  await Promise.race([
    page.waitForURL((url) => url.hostname === 'privus.fda.moph.go.th', { timeout: 60_000 }).catch(() => undefined),
    otp.first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
  ]);
  if (await otp.first().isVisible().catch(() => false)) {
    console.log('DGA ขอ OTP/MFA: กรุณาดำเนินการต่อในหน้าต่างเบราว์เซอร์');
  }
  else if (new URL(page.url()).hostname === 'privus.fda.moph.go.th') {
    console.log('เข้าสู่ SKYNET/Privus สำเร็จ');
  }
  else {
    console.log('ยังอยู่หน้า DGA: ตรวจข้อความผิดพลาด หรือดำเนินการ MFA/CAPTCHA ในเบราว์เซอร์');
  }
}

async function loginHss(page, credential) {
  await page.goto('http://oss.hss.moph.go.th/auth/login', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).protocol !== 'http:') throw new Error('HSS_TRANSPORT_CHANGED_REVIEW_ADAPTER');
  if (!await page.locator('#wbtnLogin').isVisible().catch(() => false)) {
    console.log('ใช้ HSS session เดิมสำเร็จ');
    return;
  }
  await page.locator('#username').fill(credential.username);
  await page.locator('#password').fill(credential.password);
  await page.locator('#wbtnLogin').click();
  await page.waitForTimeout(2_000);
  if (await page.locator('#wbtnLogin').isVisible().catch(() => false)) {
    console.log('HSS ยังอยู่หน้าล็อกอิน: โปรดตรวจบัญชีหรือข้อความจากระบบต้นทาง');
  }
  else {
    console.log('ส่งแบบฟอร์ม HSS แล้ว กรุณาตรวจหน้าแรกและสิทธิ์ของบัญชีในเบราว์เซอร์');
  }
}

async function loginEsta2(page, credential) {
  await page.goto('https://esta2.hss.moph.go.th/login', { waitUntil: 'domcontentloaded' });
  let currentUrl = new URL(page.url());
  if (currentUrl.hostname !== 'esta2.hss.moph.go.th' || currentUrl.protocol !== 'https:') {
    throw new Error('ESTA2_LOGIN_FAILED');
  }
  const loginButton = page.locator('#login-btn');
  if (!await loginButton.isVisible().catch(() => false)) {
    await Promise.race([
      page.waitForURL((url) => url.hostname === 'esta2.hss.moph.go.th' && url.pathname !== '/login', { timeout: 5_000 }),
      loginButton.waitFor({ state: 'visible', timeout: 5_000 }),
    ]).catch(() => undefined);
    currentUrl = new URL(page.url());
    if (currentUrl.pathname !== '/login') {
      console.log('ใช้ ESTA2 session เดิมสำเร็จ');
      return;
    }
    throw new Error('ESTA2_LOGIN_FAILED');
  }
  const username = page.locator('#login');
  const password = page.locator('#password');
  if (!await username.isVisible().catch(() => false) || !await password.isVisible().catch(() => false)) {
    throw new Error('ESTA2_LOGIN_FAILED');
  }
  await username.fill(credential.username);
  await password.fill(credential.password);
  await loginButton.click();
  await page.waitForURL((url) => url.hostname === 'esta2.hss.moph.go.th' && url.pathname !== '/login', {
    timeout: 30_000,
  }).catch(() => undefined);
  if (new URL(page.url()).pathname === '/login' || await loginButton.isVisible().catch(() => false)) {
    throw new Error('ESTA2_LOGIN_FAILED');
  }
  console.log('เข้าสู่ ESTA2 สำเร็จ');
}

async function navigateToService(page, request) {
  if (!request.service) return page;
  if (request.source.key === 'FDA_PUBLIC') {
    await page.goto(request.source.startUrl, { waitUntil: 'domcontentloaded' });
    const targetUrl = new URL(page.url());
    if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== 'meshlog.fda.moph.go.th'
      || targetUrl.pathname.toLocaleUpperCase('en-US') !== '/SEARCH_CENTER_HERB/MAIN/SEARCH_CENTER_MAIN.ASPX') {
      throw new Error('FDA_PUBLIC_SOURCE_REDIRECTED');
    }
    return page;
  }
  if (request.source.key === 'HSS_ESTA2') {
    if (request.service !== 'HSS_HEALTH_BUSINESS_APPROVED') throw new Error('SERVICE_NOT_ALLOWED');
    await page.goto('https://esta2.hss.moph.go.th/business/approved', { waitUntil: 'domcontentloaded' })
      .catch(() => { throw new Error('ESTA2_SERVICE_PAGE_FAILED'); });
    const targetUrl = new URL(page.url());
    if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== 'esta2.hss.moph.go.th'
      || targetUrl.pathname !== '/business/approved' || await page.locator('#login-btn').isVisible().catch(() => false)) {
      throw new Error('ESTA2_SERVICE_PAGE_FAILED');
    }
    return page;
  }
  const context = page.context();
  const popupPromise = context.waitForEvent('page', { timeout: 8_000 }).catch(() => undefined);

  if (request.source.key === 'FDA_SKYNET') {
    const controlId = {
      DBD: '#ContentPlaceHolder1_54',
      DOPA: '#ContentPlaceHolder1_55',
      FDA_PLACE_DRUG: '#ContentPlaceHolder1_15',
    }[request.service];
    if (!controlId) throw new Error('SERVICE_NOT_ALLOWED');
    await page.locator(controlId).click();
  }
  else {
    const linkText = {
      HSS_FACILITY: 'ธุรกรรมสถานพยาบาล',
      HSS_PROFESSIONAL: 'ธุรกรรมผู้ประกอบโรคศิลปะ',
    }[request.service];
    if (!linkText) throw new Error('SERVICE_NOT_ALLOWED');
    const serviceLink = page.locator('a').filter({ hasText: linkText }).first();
    if (await serviceLink.count() === 0) throw new Error('HSS_SERVICE_SWITCH_UNAVAILABLE');
    try {
      await serviceLink.evaluate((element) => element.click());
    }
    catch {
      throw new Error('HSS_SERVICE_SWITCH_FAILED');
    }
  }

  const popup = await popupPromise;
  const targetPage = popup || page;
  await targetPage.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);
  await targetPage.waitForTimeout(1_500);
  if (request.service === 'HSS_FACILITY') {
    await targetPage.goto('http://oss.hss.moph.go.th/medical/list', { waitUntil: 'domcontentloaded' })
      .catch(() => { throw new Error('HSS_SERVICE_PAGE_FAILED'); });
  }
  else if (request.service === 'HSS_PROFESSIONAL') {
    await targetPage.goto('http://oss.hss.moph.go.th/person/list', { waitUntil: 'domcontentloaded' })
      .catch(() => { throw new Error('HSS_SERVICE_PAGE_FAILED'); });
  }
  return targetPage;
}

async function consumeLocalSearchJob(request) {
  if (!request.jobId) return undefined;
  const response = await fetch(`${localBridgeOrigin}/v1/jobs/${request.jobId}`, {
    headers: { 'X-LawiRisk-Recon-Job': request.jobId },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
  if (!response?.ok) throw new Error('SEARCH_JOB_NOT_FOUND');
  const body = await response.json().catch(() => undefined);
  const search = body?.data;
  if (!search || search.source !== request.source.key || search.service !== request.service || search.caseId !== request.caseId) {
    throw new Error('SEARCH_JOB_NOT_FOUND');
  }
  return search;
}

function summarizeResultRows(rows) {
  return rows.slice(0, 10).map((value) => value.replace(/\s+/g, ' ').trim().slice(0, 500)).filter(Boolean);
}

async function reportSearchJob(request, operation, body) {
  if (!request.jobId) return;
  const response = await fetch(`${localBridgeOrigin}/v1/jobs/${request.jobId}/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LawiRisk-Recon-Job': request.jobId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  if (!response?.ok) throw new Error('SEARCH_RESULT_REPORT_FAILED');
}

async function runHssLocalSearch(page, request, search) {
  if (!search) return undefined;
  if (request.source.key !== 'HSS_OSS' || !request.service) throw new Error('SEARCH_FIELD_NOT_ALLOWED');
  const filterValue = resolveHssSearchFilter(request.service, search.field);
  const filter = page.locator('#lstFilter');
  const value = page.locator('#txtSearch');
  const submit = page.getByRole('button', { name: 'ค้นหา', exact: true }).first();
  if (!await filter.isVisible().catch(() => false)
    || !await value.isVisible().catch(() => false)
    || !await submit.isVisible().catch(() => false)) {
    throw new Error('SEARCH_FORM_CHANGED');
  }

  const candidates = buildLocalSearchCandidates(request.source.key, request.service, search.field, search.value);
  const querySha256 = createHash('sha256').update(search.value, 'utf8').digest('hex');
  search.value = '';
  const attempts = [];
  let resultSummaries = [];
  for (const candidate of candidates) {
    await filter.selectOption(filterValue);
    await value.fill(candidate.value);
    await submit.click();
    await page.waitForTimeout(3_000);
    const echoedValue = await value.evaluate((element) => element instanceof HTMLInputElement ? element.value : '');
    if (echoedValue !== candidate.value) throw new Error('SEARCH_REQUEST_NOT_RETAINED');
    const resultRows = await page.locator('table tr').evaluateAll((rows) => rows
      .filter((row) => row.querySelectorAll('td').length > 0)
      .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent || '').join(' '))
      .filter(Boolean));
    if (!isHssResultBoundToQuery(resultRows, candidate.value)) {
      throw new Error('SEARCH_RESULT_NOT_BOUND_TO_QUERY');
    }
    resultSummaries = summarizeResultRows(resultRows);
    attempts.push({
      strategy: candidate.strategy,
      querySha256: createHash('sha256').update(candidate.value, 'utf8').digest('hex'),
      resultRowCount: resultRows.length,
    });
    if (resultRows.length > 0) break;
  }
  const executed = attempts.at(-1);
  return {
    querySha256,
    executedQuerySha256: executed?.querySha256 || querySha256,
    searchStrategy: executed?.strategy || 'EXACT',
    attemptCount: attempts.length,
    attempts,
    resultRowCount: executed?.resultRowCount || 0,
    resultSummaries,
  };
}

async function runFdaLocalSearch(page, request, search) {
  if (!search) return undefined;
  if (request.source.key !== 'FDA_SKYNET' || !['DBD', 'DOPA'].includes(request.service)) {
    throw new Error('SEARCH_FIELD_NOT_ALLOWED');
  }
  const model = resolveFdaSearchModel(request.service, search.field);
  const value = page.locator(`input[type="text"][ng-model="${model}"]`).first();
  const submit = page.locator('input[type="button"][ng-click="BTN_SEARCH();"]').first();
  if (!await value.isVisible().catch(() => false) || !await submit.isVisible().catch(() => false)) {
    throw new Error('SEARCH_FORM_CHANGED');
  }

  const expectedPath = request.service === 'DBD'
    ? '/FDA_DBD//HOME/FRM_DBD_DATA_SEARCH'
    : '/FDA_DBD//HOME/FRM_DOPA_CITIZEN_SEARCH';
  const searchValue = search.value;
  const querySha256 = createHash('sha256').update(searchValue, 'utf8').digest('hex');
  await value.fill(searchValue);
  search.value = '';
  await submit.click();
  await page.waitForTimeout(3_000);

  const currentUrl = new URL(page.url());
  if (currentUrl.protocol !== 'https:' || currentUrl.hostname !== 'help.fda.moph.go.th'
    || currentUrl.pathname.toLocaleUpperCase('en-US') !== expectedPath.toLocaleUpperCase('en-US')) {
    throw new Error('SEARCH_FORM_CHANGED');
  }
  const echoedValue = await value.evaluate((element) => element instanceof HTMLInputElement ? element.value : '');
  if (echoedValue !== searchValue) throw new Error('SEARCH_REQUEST_NOT_RETAINED');
  const resultRows = await page.locator('table tbody tr').evaluateAll((rows) => rows
    .filter((row) => row.querySelectorAll('td').length > 0)
    .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent || '').join(' '))
    .filter(Boolean));
  if (!isHssResultBoundToQuery(resultRows, searchValue)) {
    throw new Error('SEARCH_RESULT_NOT_BOUND_TO_QUERY');
  }
  return {
    querySha256,
    executedQuerySha256: querySha256,
    searchStrategy: 'EXACT',
    attemptCount: 1,
    attempts: [{ strategy: 'EXACT', querySha256, resultRowCount: resultRows.length }],
    resultRowCount: resultRows.length,
    resultSummaries: summarizeResultRows(resultRows),
  };
}

async function runFdaPublicLocalSearch(page, request, search) {
  if (!search || request.source.key !== 'FDA_PUBLIC' || !request.service) {
    throw new Error('SEARCH_FIELD_NOT_ALLOWED');
  }
  const contract = resolveFdaPublicSearchContract(request.service, search.field);
  const searchValue = search.value;
  const querySha256 = createHash('sha256').update(searchValue, 'utf8').digest('hex');
  const category = page.locator(contract.selector);
  const value = page.locator('#ContentPlaceHolder1_txt_search');
  const submit = page.locator('#ContentPlaceHolder1_btn_search');
  if (!await category.isVisible().catch(() => false)
    || !await value.isVisible().catch(() => false)
    || !await submit.isVisible().catch(() => false)) {
    throw new Error('SEARCH_FORM_CHANGED');
  }

  if (contract.mode === 'PRODUCT') {
    const productMode = page.locator('#ContentPlaceHolder1_R_LIST');
    if (!await productMode.isVisible().catch(() => false)) throw new Error('SEARCH_FORM_CHANGED');
    await productMode.evaluate((element) => {
      if (!(element instanceof HTMLInputElement) || element.type !== 'radio') throw new Error('SEARCH_FORM_CHANGED');
      element.checked = true;
    });
    await category.evaluate((element) => {
      if (!(element instanceof HTMLInputElement) || element.type !== 'checkbox') throw new Error('SEARCH_FORM_CHANGED');
      element.checked = true;
    });
  }
  else {
    await category.click();
    await page.waitForTimeout(750);
  }
  const currentValue = page.locator('#ContentPlaceHolder1_txt_search');
  const currentSubmit = page.locator('#ContentPlaceHolder1_btn_search');
  if (!await currentValue.isVisible().catch(() => false) || !await currentSubmit.isVisible().catch(() => false)) {
    throw new Error('SEARCH_FORM_CHANGED');
  }
  await currentValue.fill(searchValue);
  search.value = '';
  await currentSubmit.click();
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(2_000);

  const currentUrl = new URL(page.url());
  if (currentUrl.protocol !== 'https:' || currentUrl.hostname !== 'meshlog.fda.moph.go.th'
    || currentUrl.pathname.toLocaleUpperCase('en-US') !== '/SEARCH_CENTER_HERB/MAIN/SEARCH_CENTER_MAIN.ASPX') {
    throw new Error('FDA_PUBLIC_SOURCE_REDIRECTED');
  }
  const echoed = await page.locator('#ContentPlaceHolder1_txt_search')
    .evaluate((element) => element instanceof HTMLInputElement ? element.value : '');
  if (echoed !== searchValue) throw new Error('SEARCH_REQUEST_NOT_RETAINED');
  const resultGridSelector = contract.mode === 'LOCATION'
    ? '#ContentPlaceHolder1_RAD_LCN_ctl00 tr'
    : '#ContentPlaceHolder1_RadGrid1_ctl00 tr';
  const resultRows = await page.locator(resultGridSelector).evaluateAll((rows) => rows
    .filter((row) => row.querySelectorAll('td').length > 1)
    .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent || '').join(' ').replace(/\s+/g, ' ').trim())
    .filter((row) => row && !/No records to display|ไม่พบข้อมูล/i.test(row)));
  const boundedRows = resultRows.filter((row) => isHssResultBoundToQuery([row], searchValue));
  if (resultRows.length > 0 && boundedRows.length === 0) throw new Error('SEARCH_RESULT_NOT_BOUND_TO_QUERY');
  return {
    querySha256,
    executedQuerySha256: querySha256,
    searchStrategy: contract.mode === 'LOCATION' ? 'EXACT_LOCATION' : 'EXACT_PRODUCT',
    attemptCount: 1,
    attempts: [{ strategy: contract.mode, querySha256, resultRowCount: boundedRows.length }],
    resultRowCount: boundedRows.length,
    resultSummaries: summarizeResultRows(boundedRows),
  };
}

async function runEsta2LocalSearch(page, request, search) {
  if (!search) return undefined;
  if (request.source.key !== 'HSS_ESTA2' || request.service !== 'HSS_HEALTH_BUSINESS_APPROVED') {
    throw new Error('SEARCH_FIELD_NOT_ALLOWED');
  }
  const optionLabel = resolveEsta2SearchOption(request.service, search.field);
  await page.waitForFunction((expectedLabel) => [...document.querySelectorAll('select option')]
    .some((option) => option.textContent?.replace(/\s+/g, ' ').trim() === expectedLabel), optionLabel, {
    timeout: 10_000,
  }).catch(() => { throw new Error('SEARCH_FORM_CHANGED'); });
  const selects = page.locator('select');
  let filter;
  for (let index = 0; index < Math.min(await selects.count(), 20); index += 1) {
    const candidate = selects.nth(index);
    const labels = await candidate.locator('option').allTextContents().catch(() => []);
    if (labels.some((label) => label.replace(/\s+/g, ' ').trim() === optionLabel)) {
      filter = candidate;
      break;
    }
  }
  const value = page.locator('input[placeholder*="พิมพ์คำค้นหา"]').first();
  if (!filter || !await filter.isVisible().catch(() => false) || !await value.isVisible().catch(() => false)) {
    throw new Error('SEARCH_FORM_CHANGED');
  }

  const candidates = buildLocalSearchCandidates(request.source.key, request.service, search.field, search.value);
  const querySha256 = createHash('sha256').update(search.value, 'utf8').digest('hex');
  search.value = '';
  const attempts = [];
  let resultSummaries = [];
  for (const candidate of candidates) {
    await filter.selectOption({ label: optionLabel });
    await value.fill(candidate.value);
    const form = value.locator('xpath=ancestor::form[1]');
    if (await form.count()) {
      await form.evaluate((element) => element.requestSubmit());
    }
    else {
      const submit = page.locator('button[type="submit"]').filter({ visible: true }).first();
      if (!await submit.isVisible().catch(() => false)) throw new Error('SEARCH_FORM_CHANGED');
      await submit.click();
    }
    await page.waitForTimeout(3_000);
    const currentUrl = new URL(page.url());
    if (currentUrl.hostname !== 'esta2.hss.moph.go.th' || currentUrl.pathname !== '/business/approved') {
      throw new Error('SEARCH_FORM_CHANGED');
    }
    const echoedValue = await value.evaluate((element) => element instanceof HTMLInputElement ? element.value : '');
    if (echoedValue !== candidate.value) throw new Error('SEARCH_REQUEST_NOT_RETAINED');
    const resultRows = await page.locator('table tbody tr').evaluateAll((rows) => rows
      .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent || '').join(' '))
      .filter(Boolean));
    if (!isHssResultBoundToQuery(resultRows, candidate.value)) {
      throw new Error('SEARCH_RESULT_NOT_BOUND_TO_QUERY');
    }
    resultSummaries = summarizeResultRows(resultRows);
    attempts.push({
      strategy: candidate.strategy,
      querySha256: createHash('sha256').update(candidate.value, 'utf8').digest('hex'),
      resultRowCount: resultRows.length,
    });
    if (resultRows.length > 0) break;
  }
  const executed = attempts.at(-1);
  return {
    querySha256,
    executedQuerySha256: executed?.querySha256 || querySha256,
    searchStrategy: executed?.strategy || 'EXACT',
    attemptCount: attempts.length,
    attempts,
    resultRowCount: executed?.resultRowCount || 0,
    resultSummaries,
  };
}

async function runLocalSearch(page, request, search) {
  if (!search) return undefined;
  if (request.source.key === 'FDA_PUBLIC') return runFdaPublicLocalSearch(page, request, search);
  if (request.source.key === 'FDA_SKYNET') return runFdaLocalSearch(page, request, search);
  if (request.source.key === 'HSS_OSS') return runHssLocalSearch(page, request, search);
  if (request.source.key === 'HSS_ESTA2') return runEsta2LocalSearch(page, request, search);
  throw new Error('SEARCH_FIELD_NOT_ALLOWED');
}

async function captureLocalSearchResult(page, request, search, searchResult) {
  if (!search || !searchResult || !request.jobId) return undefined;
  const resultDir = path.join(localRoot, 'recon-results');
  await mkdir(resultDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${request.source.key}-${request.service}-${timestamp}-${request.jobId}`;
  const pdfPath = path.join(resultDir, `${baseName}.pdf`);
  const screenshotPath = path.join(resultDir, `${baseName}.png`);
  const metadataPath = path.join(resultDir, `${baseName}.json`);
  try {
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    // Capture the same rendered result page. This is original visual context, not an AI-generated illustration.
    await page.screenshot({ path: screenshotPath, type: 'png', fullPage: true });
    const [pdfBytes, screenshotBytes] = await Promise.all([readFile(pdfPath), readFile(screenshotPath)]);
    const metadata = {
      schemaVersion: 2,
      status: 'LOCAL_CAPTURE_PENDING_IMPORT',
      caseId: search.caseId,
      purpose: search.purpose,
      source: request.source.key,
      service: request.service,
      searchField: search.field,
      querySha256: searchResult.querySha256,
      executedQuerySha256: searchResult.executedQuerySha256,
      searchStrategy: searchResult.searchStrategy,
      searchAttemptCount: searchResult.attemptCount,
      searchAttempts: searchResult.attempts,
      resultRowCount: searchResult.resultRowCount,
      sourceUrl: toPathOnly(page.url(), page.url()),
      capturedAt: new Date().toISOString(),
      adapterVersion: request.source.adapterVersion,
      pdfFilename: path.basename(pdfPath),
      pdfSha256: createHash('sha256').update(pdfBytes).digest('hex'),
      screenshotFilename: path.basename(screenshotPath),
      screenshotSha256: createHash('sha256').update(screenshotBytes).digest('hex'),
      rawQueryStoredInMetadata: false,
      resultPdfMayContainQuery: true,
      importedToEvidenceVault: false,
      humanReviewed: false,
    };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`บันทึกผลค้นและ SHA-256 ไว้บนเครื่องแล้ว: ${pdfPath}`);
    search.purpose = '';
    return {
      pdfFilename: metadata.pdfFilename,
      metadataFilename: path.basename(metadataPath),
      pdfSha256: metadata.pdfSha256,
      screenshotFilename: metadata.screenshotFilename,
      screenshotSha256: metadata.screenshotSha256,
      resultRowCount: metadata.resultRowCount,
      resultSummaries: searchResult.resultSummaries || [],
      capturedAt: metadata.capturedAt,
      sourceUrl: metadata.sourceUrl,
      adapterVersion: metadata.adapterVersion,
      searchStrategy: metadata.searchStrategy,
      searchAttemptCount: metadata.searchAttemptCount,
    };
  }
  catch {
    throw new Error('SEARCH_CAPTURE_FAILED');
  }
}

function toPathOnly(rawUrl, baseUrl) {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl, baseUrl);
    return `${url.origin}${url.pathname}`;
  }
  catch {
    return undefined;
  }
}

async function captureSanitizedPageContract(page, source, service) {
  const frames = [];
  for (const frame of page.frames()) {
    try {
      const frameContract = await frame.evaluate(() => {
        const cleanText = (value) => {
          const compact = value?.replace(/\s+/g, ' ').trim();
          if (!compact) return undefined;
          return compact
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
            .replace(/\b\d{13}\b/g, '[REDACTED_ID]')
            .replace(/\b0\d{8,9}\b/g, '[REDACTED_PHONE]')
            .slice(0, 120);
        };
        const labelFor = (element) => {
          if (!element.id) return undefined;
          const labels = [...document.querySelectorAll('label')];
          return cleanText(labels.find((label) => label.htmlFor === element.id)?.textContent);
        };
        const controls = [...document.querySelectorAll('input, select, textarea, button')]
          .filter((element) => !(element instanceof HTMLInputElement) || !['hidden', 'password'].includes(element.type))
          .slice(0, 250)
          .map((element) => {
            const isNavigationChrome = Boolean(element.closest('header, nav, .navbar')) && !element.closest('form');
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id || undefined,
              name: element.getAttribute('name') || undefined,
              type: element.getAttribute('type') || undefined,
              className: cleanText(element.getAttribute('class')),
              label: labelFor(element),
              ariaLabel: element.getAttribute('aria-label') || undefined,
              placeholder: element.getAttribute('placeholder') || undefined,
              ngModel: element.getAttribute('ng-model') || element.getAttribute('data-ng-model') || undefined,
              ngClick: element.getAttribute('ng-click') || element.getAttribute('data-ng-click') || undefined,
              maxLength: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
                ? (element.maxLength > -1 ? element.maxLength : undefined)
                : undefined,
              contextText: isNavigationChrome
                ? undefined
                : cleanText(element.closest('label, td, th, .form-group, .input-group, fieldset')?.textContent
                  || element.parentElement?.textContent),
              displayText: element instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(element.type)
                ? cleanText(element.value)
                : (isNavigationChrome ? undefined : cleanText(element.textContent)),
              options: element instanceof HTMLSelectElement
                ? [...element.options].slice(0, 60).map((option) => ({ value: option.value.slice(0, 80), text: cleanText(option.textContent) }))
                : undefined,
            };
          });
        const forms = [...document.forms].slice(0, 40).map((form) => ({
          id: form.id || undefined,
          name: form.getAttribute('name') || undefined,
          method: (form.method || 'get').toUpperCase(),
          action: form.getAttribute('action') || undefined,
        }));
        const links = [...document.querySelectorAll('a[href]')].slice(0, 250).map((link) => ({
          id: link.id || undefined,
          ariaLabel: link.getAttribute('aria-label') || undefined,
          displayText: link.closest('header, nav, .navbar') ? undefined : cleanText(link.textContent),
          href: link.getAttribute('href') || undefined,
        }));
        return { title: document.title, controls, forms, links };
      });
      frames.push({
        url: toPathOnly(frame.url(), page.url()),
        title: frameContract.title,
        controls: frameContract.controls,
        forms: frameContract.forms.map((form) => ({ ...form, action: toPathOnly(form.action, frame.url()) })),
        links: frameContract.links.map((link) => ({ ...link, href: toPathOnly(link.href, frame.url()) })),
      });
    }
    catch {
      frames.push({ url: toPathOnly(frame.url(), page.url()), inaccessible: true });
    }
  }

  const contractDir = path.join(localRoot, 'recon-page-contracts');
  await mkdir(contractDir, { recursive: true });
  const contract = {
    schemaVersion: 1,
    source: source.key,
    service: service || null,
    adapterVersion: source.adapterVersion,
    capturedAt: new Date().toISOString(),
    valuesCaptured: false,
    credentialsCaptured: false,
    frames,
  };
  const contractName = service ? `${source.key}-${service}` : source.key;
  await writeFile(path.join(contractDir, `${contractName}.json`), JSON.stringify(contract, null, 2), 'utf8');
  console.log('บันทึก page contract แบบไม่เก็บค่าในช่องกรอกไว้บนเครื่องแล้ว');
}

async function keepAlive(context) {
  console.log('Recon Companion จะทำงานจนกว่าจะปิดหน้าต่างเบราว์เซอร์');
  await new Promise((resolve) => context.once('close', resolve));
}

async function main() {
  const rawUri = process.argv[2];
  if (!rawUri) throw new Error('INVALID_RECON_PROTOCOL');
  const request = parseReconUri(rawUri);
  if (request.action === 'setup') {
    await configureCredential(request.source.key);
    return;
  }
  assertSourceLaunchAllowed(request);
  const localSearch = await consumeLocalSearchJob(request);
  if (!request.source.secureTransport) {
    console.warn('คำเตือน: HSS ใช้ HTTP รหัสผ่านจะถูกส่งโดยไม่มี TLS ตามข้อจำกัดของระบบต้นทาง');
  }

  const credential = request.source.key === 'FDA_PUBLIC'
    ? undefined
    : await getOrConfigureCredential(request.source.key);
  const profileDir = path.join(localRoot, 'recon-browser-profiles', request.source.key);
  await mkdir(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    if (request.source.key === 'FDA_PUBLIC') await page.goto(request.source.startUrl, { waitUntil: 'domcontentloaded' });
    else if (request.source.key === 'FDA_SKYNET') await loginFda(page, credential);
    else if (request.source.key === 'HSS_OSS') await loginHss(page, credential);
    else if (request.source.key === 'HSS_ESTA2') await loginEsta2(page, credential);
    else throw new Error('SOURCE_NOT_ALLOWED');
    const targetPage = await navigateToService(page, request);
    await targetPage.waitForTimeout(1_000);
    await captureSanitizedPageContract(targetPage, request.source, request.service);
    const searchResult = await runLocalSearch(targetPage, request, localSearch);
    const capturedResult = await captureLocalSearchResult(targetPage, request, localSearch, searchResult);
    if (capturedResult) await reportSearchJob(request, 'complete', capturedResult);
  }
  catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
  finally {
    if (credential) {
      credential.username = '';
      credential.password = '';
    }
  }
  if (localSearch) await context.close().catch(() => undefined);
  else await keepAlive(context);
}

main().catch(async (error) => {
  const errorCode = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : 'RECON_COMPANION_FAILED';
  const failureDir = path.join(localRoot, 'recon-failures');
  await mkdir(failureDir, { recursive: true }).catch(() => undefined);
  await writeFile(path.join(failureDir, `failure-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({
    schemaVersion: 1,
    errorCode,
    occurredAt: new Date().toISOString(),
    credentialsCaptured: false,
    rawQueryCaptured: false,
  }, null, 2), 'utf8').catch(() => undefined);
  try {
    const failedRequest = process.argv[2] ? parseReconUri(process.argv[2]) : undefined;
    if (failedRequest?.jobId) await reportSearchJob(failedRequest, 'fail', { errorCode });
  }
  catch {
    // The local failure record remains available when the bridge callback cannot be reached.
  }
  console.error(safeCompanionMessage(error));
  process.exitCode = 1;
});
