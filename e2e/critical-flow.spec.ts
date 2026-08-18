import { expect, test, type Page } from '@playwright/test';

async function loginAsInvestigator(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'เข้าใช้งานในฐานะพนักงานสืบสวน' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /เห็นภาพรวมเร็วขึ้น/ })).toBeVisible();
}

test('protects the workspace and exposes an explicit demo login', async ({ page }) => {
  await page.goto('/cases');
  await expect(page).toHaveURL(/\/login\?next=%2Fcases/);
  await expect(page.getByText('โหมดสาธิต · ข้อมูลอยู่ในอุปกรณ์นี้')).toBeVisible();
});

test('loads authenticated dashboard data and case registry', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/cases');
  await expect(page.getByRole('heading', { name: /คดีสืบสวนทั้งหมด/ })).toBeVisible();
  await expect(page.getByText(/ค\.123\/2569/).first()).toBeVisible();
});

test('imports a validated UTF-8 CSV batch through the real API route', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/intake');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'intake.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('complainant_mode,urgency,urgency_reason\nANONYMOUS,HIGH,"แจ้งเหตุ, ต้องตรวจสอบ"', 'utf8'),
  });
  await page.getByRole('button', { name: 'นำเข้า', exact: true }).click();
  await expect(page.getByText(/นำเข้าแล้ว 1 แถว; ไม่ผ่าน 0 แถว/)).toBeVisible();
});

test('rejects authenticated browser mutations without a trusted Origin header', async ({ page }) => {
  await loginAsInvestigator(page);
  const response = await page.request.post('/api/v1/cases', { data: { number: 'CSRF-1', title: 'ต้องไม่ถูกสร้าง' } });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNTRUSTED_ORIGIN' } });
});

test('keeps the command center usable on mobile and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginAsInvestigator(page);

  const menuButton = page.getByRole('button', { name: 'เปิดเมนูหลัก' });
  await menuButton.click();
  await expect(page.getByRole('dialog', { name: 'เมนูหลัก' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ปิดเมนู', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'เมนูหลัก' })).toBeHidden();
  await expect(menuButton).toBeFocused();

  const animationDurationMs = await page.locator('.page-enter > *').first().evaluate((element) => {
    const duration = getComputedStyle(element).animationDuration;
    return duration.endsWith('ms') ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
  });
  expect(animationDurationMs).toBeLessThanOrEqual(0.01);
});

test('allows only reviewed external sources and fails closed for insecure transport', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/sources');
  await expect(page.getByRole('heading', { name: 'แหล่งสืบค้นที่ได้รับอนุญาต' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SKYNET / Privus อย.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /เปิด SKYNET \/ Privus อย\./ })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'OSS สบส.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ปิดการเปิดใช้งานจนกว่าจะมี HTTPS/API' })).toBeDisabled();

  const blocked = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/HSS_OSS/launch', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(blocked).toMatchObject({ status: 409, body: { error: { code: 'SOURCE_INSECURE_TRANSPORT' } } });
});

test('denies source registry access to viewer role', async ({ page }) => {
  await page.context().addCookies([
    { name: 'mock-auth-logged-in', value: 'true', url: 'http://127.0.0.1:3100' },
    { name: 'mock-auth-role', value: 'VIEWER', url: 'http://127.0.0.1:3100' },
  ]);
  const response = await page.request.get('/api/v1/sources');
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
});
