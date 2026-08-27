#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { assertSourceLaunchAllowed, parseReconUri, safeCompanionMessage } from './companion-contract.mjs';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const credentialScript = path.join(scriptDir, 'credential-store.ps1');
const localRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'LawiRisk-SSK');

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

async function navigateToService(page, request) {
  if (!request.service) return page;
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
  else if (request.service === 'DBD' || request.service === 'DOPA') {
    const openSearch = targetPage.locator('input[type="button"][value*="ค้นหา"]').first();
    if (await openSearch.isVisible().catch(() => false)) {
      await openSearch.click();
      await targetPage.waitForTimeout(1_000);
    }
  }
  return targetPage;
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
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            id: element.id || undefined,
            name: element.getAttribute('name') || undefined,
            type: element.getAttribute('type') || undefined,
            label: labelFor(element),
            ariaLabel: element.getAttribute('aria-label') || undefined,
            placeholder: element.getAttribute('placeholder') || undefined,
            displayText: element instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(element.type)
              ? cleanText(element.value)
              : cleanText(element.textContent),
            options: element instanceof HTMLSelectElement
              ? [...element.options].slice(0, 60).map((option) => ({ value: option.value.slice(0, 80), text: cleanText(option.textContent) }))
              : undefined,
          }));
        const forms = [...document.forms].slice(0, 40).map((form) => ({
          id: form.id || undefined,
          name: form.getAttribute('name') || undefined,
          method: (form.method || 'get').toUpperCase(),
          action: form.getAttribute('action') || undefined,
        }));
        const links = [...document.querySelectorAll('a[href]')].slice(0, 250).map((link) => ({
          id: link.id || undefined,
          ariaLabel: link.getAttribute('aria-label') || undefined,
          displayText: cleanText(link.textContent),
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
  if (!request.source.secureTransport) {
    console.warn('คำเตือน: HSS ใช้ HTTP รหัสผ่านจะถูกส่งโดยไม่มี TLS ตามข้อจำกัดของระบบต้นทาง');
  }

  const credential = await getOrConfigureCredential(request.source.key);
  const profileDir = path.join(localRoot, 'recon-browser-profiles', request.source.key);
  await mkdir(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    if (request.source.key === 'FDA_SKYNET') await loginFda(page, credential);
    else await loginHss(page, credential);
    const targetPage = await navigateToService(page, request);
    await targetPage.waitForTimeout(1_000);
    await captureSanitizedPageContract(targetPage, request.source, request.service);
  }
  catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
  finally {
    credential.username = '';
    credential.password = '';
  }
  await keepAlive(context);
}

main().catch((error) => {
  console.error(safeCompanionMessage(error));
  process.exitCode = 1;
});
