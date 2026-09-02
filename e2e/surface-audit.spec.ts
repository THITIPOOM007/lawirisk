import { expect, test, type Page } from '@playwright/test';

const testBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100';

const protectedSurfaces = [
  '/',
  '/intake',
  '/intake/env-1',
  '/cases',
  '/cases/new',
  '/cases/case-1',
  '/sources',
  '/evidence',
  '/automation',
  '/review',
  '/entities',
  '/matches',
  '/universe',
  '/reports',
  '/audit',
  '/security',
  '/guide',
  '/satisfaction',
  '/admin/settings',
] as const;

async function useAdminSession(page: Page) {
  await page.context().addCookies([
    { name: 'mock-auth-logged-in', value: 'true', url: testBaseUrl },
    { name: 'mock-auth-role', value: 'ADMIN', url: testBaseUrl },
    { name: 'mock-auth-name', value: encodeURIComponent('ผู้ดูแลระบบทดสอบ'), url: testBaseUrl },
  ]);
  await page.addInitScript(() => window.localStorage.setItem('lawirisk-guide-tour-seen-v1', 'true'));
}

async function auditSurface(page: Page, route: string, mobile: boolean) {
  const failures: string[] = [];
  const onPageError = (error: Error) => failures.push(`pageerror: ${error.message}`);
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  };
  const onResponse = (response: { status(): number; url(): string }) => {
    if (response.status() >= 500 && response.url().startsWith(testBaseUrl)) {
      failures.push(`response: ${response.status()} ${response.url()}`);
    }
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('response', onResponse);

  try {
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status(), `${route} should render`).toBe(200);
    await expect(page.locator('main h1').first(), `${route} should expose a primary heading`).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');

    if (mobile) {
      const layout = await page.evaluate(() => {
        const main = document.querySelector('main');
        return {
          bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
          mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
        };
      });
      expect(layout.bodyOverflow, `${route} should not overflow the mobile viewport`).toBeLessThanOrEqual(1);
      expect(layout.mainOverflow, `${route} main content should contain horizontal overflow`).toBeLessThanOrEqual(1);
    }

    expect(failures, `${route} emitted runtime failures:\n${failures.join('\n')}`).toEqual([]);
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('response', onResponse);
  }
}

test('all authenticated screens render without runtime or server failures on desktop', async ({ page }) => {
  await useAdminSession(page);
  const failures: string[] = [];
  for (const route of protectedSurfaces) {
    try {
      await auditSurface(page, route, false);
    } catch (caught) {
      failures.push(caught instanceof Error ? caught.message : `${route}: unknown failure`);
    }
  }
  expect(failures, failures.join('\n\n')).toEqual([]);
});

test('all authenticated screens stay inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useAdminSession(page);
  const failures: string[] = [];
  for (const route of protectedSurfaces) {
    try {
      await auditSurface(page, route, true);
    } catch (caught) {
      failures.push(caught instanceof Error ? caught.message : `${route}: unknown failure`);
    }
  }
  expect(failures, failures.join('\n\n')).toEqual([]);
});

test('public and login surfaces render without authenticated workspace state', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('status of 401')) failures.push(text);
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 2, name: 'เข้าสู่ระบบงานสืบสวน' })).toBeVisible();
  failures.length = 0;
  await page.goto('/public', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: /ตรวจสอบก่อนตัดสินใจ/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'เริ่มใช้งานได้ใน 3 ขั้นตอน' })).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
    mainOverflow: document.querySelector('main')?.scrollWidth ?? 0,
    mainWidth: document.querySelector('main')?.clientWidth ?? 0,
  }));
  expect(mobileLayout.bodyOverflow).toBeLessThanOrEqual(1);
  expect(mobileLayout.mainOverflow - mobileLayout.mainWidth).toBeLessThanOrEqual(1);
  expect(failures).toEqual([]);

  await page.getByRole('tab', { name: /สแกนภาพสินค้าที่สงสัย/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'สแกนภาพสินค้าที่สงสัย' })).toBeVisible();
  const scanInput = page.getByLabel('เลือกรูปสินค้าที่ต้องการสแกน');
  await expect(scanInput).toBeAttached();
  await expect(scanInput).toHaveAttribute('multiple', '');
  await expect(page.getByText(/ขนาดรวมไม่เกิน 50 MB/)).toBeVisible();
  await page.getByRole('tab', { name: /แจ้งเรื่องร้องเรียน/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /แบบฟอร์มแจ้งเรื่องร้องเรียน/ })).toBeVisible();
  await page.getByRole('tab', { name: /ติดตามสถานะเรื่องร้องเรียน/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /ตรวจสอบสถานะคำร้อง/ })).toBeVisible();
  await page.getByRole('tab', { name: /ตรวจสอบทะเบียนทางการ/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'ค้นข้อมูลจากทะเบียนทางการ' })).toBeVisible();
  expect(failures).toEqual([]);
  await context.close();
});
