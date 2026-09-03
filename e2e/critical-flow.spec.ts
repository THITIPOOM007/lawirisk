import { expect, test, type Page } from '@playwright/test';

const testBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100';

async function loginAsInvestigator(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'เข้าใช้งานในฐานะพนักงานสืบสวน' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /ระบบสืบสวนและเชื่อมโยง/ })).toBeVisible();
}

test('protects the workspace and exposes an explicit demo login', async ({ page }) => {
  await page.goto('/cases');
  await expect(page).toHaveURL(/\/login\?next=%2Fcases/);
  await expect(page.getByText('โหมดสาธิต · จำลองการทำงานในอุปกรณ์')).toBeVisible();
});

test('loads authenticated dashboard data and case registry', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/cases');
  await expect(page.getByRole('heading', { level: 1, name: 'ทะเบียนสำนวนคดีสืบสวน' })).toBeVisible();
  await expect(page.getByText(/ค\.123\/2569/).first()).toBeVisible();
});

test('opens the futuristic command deck and reports real runtime readiness', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/');
  await page.keyboard.press('Control+K');
  const commandDeck = page.getByRole('dialog', { name: 'ศูนย์คำสั่งลัด' });
  await expect(commandDeck).toBeVisible();
  await commandDeck.getByLabel('ค้นหาระบบหรือคำสั่ง').fill('คลังหลักฐาน');
  await expect(commandDeck.getByRole('option', { name: /คลังหลักฐานดิจิทัล/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/evidence$/);

  await page.goto('/');
  const pulse = page.getByRole('button', { name: /DEMO SYSTEM|RUNTIME CONFIGURED|ATTENTION REQUIRED|STATUS UNKNOWN/ });
  await expect(pulse).toBeVisible();
  await pulse.click();
  const readiness = page.getByRole('dialog', { name: 'สถานะความพร้อมของระบบ' });
  await expect(readiness).toContainText('Evidence Vault');
  await expect(readiness).toContainText('Automation Engine');
  const readinessBox = await readiness.boundingBox();
  expect(readinessBox).not.toBeNull();
  expect(readinessBox!.x + readinessBox!.width).toBeLessThanOrEqual(1280);
  expect(readinessBox!.x).toBeGreaterThan(850);
});

test('opens a real notification center, deep-links to source work, and persists read state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAsInvestigator(page);
  await page.goto('/intake');

  const trigger = page.getByRole('button', { name: /เปิดศูนย์แจ้งเตือน/ });
  await expect(trigger).toHaveAccessibleName(/มี \d+ รายการที่ยังไม่ได้อ่าน/);
  const badge = page.getByTestId('notification-unread-badge');
  await expect(badge).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  const badgeBox = await badge.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();
  expect(badgeBox!.x).toBeGreaterThanOrEqual(triggerBox!.x);
  expect(badgeBox!.y).toBeGreaterThanOrEqual(triggerBox!.y);
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(triggerBox!.x + triggerBox!.width);
  expect(badgeBox!.y + badgeBox!.height).toBeLessThanOrEqual(triggerBox!.y + triggerBox!.height);
  await trigger.click();
  const center = page.getByRole('dialog', { name: 'ศูนย์แจ้งเตือน' });
  await expect(center).toBeVisible();
  await expect(center.getByText('ศูนย์แจ้งเตือนและงานที่ต้องดำเนินการ')).toBeVisible();
  await expect(center.getByText(/เบาะแสเร่งด่วนรอคัดกรอง/).first()).toBeVisible();
  const centerBox = await center.boundingBox();
  expect(centerBox).not.toBeNull();
  expect(centerBox!.x).toBeGreaterThan(820);
  expect(centerBox!.x + centerBox!.width).toBeLessThanOrEqual(1280);

  await center.getByText(/เบาะแสเร่งด่วนรอคัดกรอง/).first().click();
  await expect(page).toHaveURL(/\/intake\/env-/);
  await expect(center).toBeHidden();

  await page.goto('/intake');
  await trigger.click();
  await center.getByRole('button', { name: /อ่านแล้วทั้งหมด/ }).click();
  await expect(center.getByText('อ่านรายการสำคัญครบแล้ว')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'เปิดศูนย์แจ้งเตือน' }).click();
  await expect(page.getByRole('dialog', { name: 'ศูนย์แจ้งเตือน' }).getByText('อ่านรายการสำคัญครบแล้ว')).toBeVisible();

  const blocked = await page.request.patch('/api/v1/notifications', { data: { ids: ['intake:env-1:triage'] } });
  expect(blocked.status()).toBe(403);
  await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'UNTRUSTED_ORIGIN' } });
});

test('creates a case without the onboarding nudge covering the primary action', async ({ page }) => {
  const caseNumber = `E2E-NUDGE-${Date.now()}/2569`;
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAsInvestigator(page);
  await page.goto('/cases/new');
  await expect(page.getByText('เพิ่งเริ่มใช้งานใช่ไหม?')).toBeHidden();
  await page.getByLabel('เลขคดี / หมายเลขรับเรื่อง *').fill(caseNumber);
  await page.getByLabel('ชื่อคดีสืบสวน *').fill('ข้อมูลสังเคราะห์: ทดสอบพื้นที่ปุ่มบันทึก');
  await page.getByLabel('รายละเอียดคดีและเป้าหมายสืบสวน').fill('ทดสอบว่าข้อความแนะนำไม่ปิดทับปุ่มบันทึกบนหน้าจอขนาดกลาง');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page).toHaveURL('/cases');
  await expect(page.getByText(caseNumber)).toBeVisible();
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

test('searches source-bound intelligence findings and generates safe dossier drafts', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/cases/case-1');
  await expect(page.getByRole('heading', { name: 'Case Intelligence Workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'คำตอบและคำแนะนำอัตโนมัติพร้อมใช้งาน' })).toBeVisible();
  await expect(page.getByText('AUTO_ADVICE_READY', { exact: true })).toBeVisible();
  await expect(page.getByText(/ใช้จัดลำดับงานได้ทันที/).first()).toBeVisible();
  await page.getByRole('button', { name: 'ค้นอัตโนมัติและเก็บหลักฐาน' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'คำตอบจากการค้น' })).toContainText('พบข้อมูลที่ตรวจย้อนกลับได้');
  await expect(page.getByRole('heading', { name: 'หลักฐานต้นฉบับที่ระบบพบ' })).toBeVisible();
  await expect(page.getByText('fb_ad_screenshot.png').last()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ข้อมูลที่ระบบพบ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'งานที่ระบบพักไว้เพื่อความปลอดภัย' })).toBeHidden();
  await expect(page.getByText('ข้อเท็จจริงที่ตรวจทานแล้ว').first()).toBeVisible();
  await expect(page.getByText(/SHA-256 89504E47d32b/).first()).toBeVisible();
  const scopeDetails = page.getByText(/ดูขอบเขตและช่องทางที่ระบบตรวจสอบทั้งหมด/);
  await expect(scopeDetails).toBeVisible();
  await scopeDetails.click();
  await expect(page.getByText('ทะเบียนบุคคลและนิติบุคคล')).toBeVisible();
  await expect(page.getByText('ต้องตรวจ/ยืนยัน').first()).toBeVisible();
  await expect(page.getByText('ชื่อ เบอร์โทร และช่องทางติดต่อ')).toBeVisible();
  await expect(page.getByText('ภาพถ่ายและภาพเชื่อมโยง')).toBeVisible();
  await expect(page.getByText('พยานแวดล้อมและลำดับเหตุการณ์')).toBeVisible();
  await expect(page.getByText('ความเชื่อมโยงข้ามคดี')).toBeVisible();

  await page.getByRole('button', { name: 'สร้างร่างแฟ้ม' }).click();
  const dialog = page.getByRole('dialog', { name: 'ร่างแฟ้มสืบสวน' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('ยังไม่ใช่หนังสือราชการฉบับลงนาม')).toBeVisible();
  await expect(dialog.locator('pre')).toContainText('ร่างเพื่อการตรวจทาน');
});

test('creates a text-only manual intake that is immediately ready for triage', async ({ page }) => {
  const incidentSummary = `ทดสอบรับเรื่องด้วยมือพร้อมเข้าสู่การคัดกรอง ${Date.now()}`;
  await loginAsInvestigator(page);
  await page.goto('/intake');
  await page.getByRole('button', { name: /บันทึกรับเรื่องร้องเรียน/ }).click();
  await expect(page.getByLabel(/สถานะข้อมูลผู้ร้อง/)).toHaveValue('INCOMPLETE');
  await page.getByLabel(/สรุปพฤติการณ์/).fill(incidentSummary);
  await page.getByRole('button', { name: 'บันทึกรับเรื่อง', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'รับคำร้องแล้วและพร้อมเข้าสู่การคัดกรอง' })).toBeVisible();
  await expect(page.getByText(incidentSummary)).toBeVisible();
  await expect(page.getByText('ปลอดภัย').last()).toBeVisible();
});

test('runs the protected match scan and rejects cross-origin mutations', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/matches');
  await page.getByRole('button', { name: 'ประมวลผลค้นหาความเชื่อมโยงอัตโนมัติ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'สแกนเสร็จสิ้น' })).toBeVisible();

  const blocked = await page.request.post('/api/v1/matches/scan', { data: {} });
  expect(blocked.status()).toBe(403);
  await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'UNTRUSTED_ORIGIN' } });
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

test('provides a searchable complete guide and a skippable responsive tour', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/guide');

  await expect(page.getByRole('heading', { level: 1, name: /คู่มือที่พาคุณทำงาน/ })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(15);
  await page.getByRole('searchbox', { name: 'ค้นหาคู่มือ' }).fill('Passkey');
  await expect(page.getByRole('heading', { level: 3, name: 'Passkey และการสแกนชีวมิติ' })).toBeVisible();
  await expect(page.getByText('พบ 2 จาก 15 หัวข้อ')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const guideButton = page.getByRole('button', { name: 'เปิดทัวร์แนะนำการใช้งาน' });
  await guideButton.click();
  const tour = page.getByRole('dialog', { name: 'เริ่มใช้ LawiRisk-SSK อย่างเป็นระบบ' });
  await expect(tour).toBeVisible();

  const tourBox = await tour.boundingBox();
  expect(tourBox).not.toBeNull();
  expect(tourBox!.x).toBeGreaterThanOrEqual(0);
  expect(tourBox!.y).toBeGreaterThanOrEqual(0);
  expect(tourBox!.x + tourBox!.width).toBeLessThanOrEqual(390);
  expect(tourBox!.y + tourBox!.height).toBeLessThanOrEqual(844);

  await page.getByRole('button', { name: 'ข้ามทัวร์' }).click();
  await expect(tour).toBeHidden();
  await expect(guideButton).toBeFocused();
});

test('offers local auto-login and requires per-launch acknowledgement for insecure HSS transport', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/sources');
  await expect(page.getByRole('heading', { level: 1, name: 'แหล่งสืบค้นข้อมูลที่ได้รับอนุญาต' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SKYNET / Privus อย.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ตั้ง/เปลี่ยนบัญชีบนเครื่องนี้' })).toHaveCount(3);
  await expect(page.getByRole('radio', { name: /ทะเบียนนิติบุคคล/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /ทะเบียนบุคคล/ })).toBeVisible();
  const fdaCard = page.getByRole('heading', { name: 'SKYNET / Privus อย.' }).locator('xpath=ancestor::article[1]');
  await expect(fdaCard.getByText('ค้นอัตโนมัติแบบระบุตรง local-only')).toBeVisible();
  await expect(fdaCard.getByLabel('ประเภทคำค้น')).toHaveValue('JURISTIC_ID');
  await expect(fdaCard.getByRole('button', { name: 'ล็อกอิน ค้น และบันทึกผล PDF อัตโนมัติ' })).toBeDisabled();
  await expect(fdaCard.getByRole('button', { name: 'ล็อกอินและเปิดหน้าสืบค้นที่เลือก' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'OSS สบส.' })).toBeVisible();
  const hssCard = page.getByRole('heading', { name: 'OSS สบส.' }).locator('xpath=ancestor::article[1]');
  await expect(hssCard.getByRole('radio', { name: /ข้อมูลสถานพยาบาล/ })).toBeChecked();
  await expect(hssCard.getByText('ค้นอัตโนมัติหลายระดับแบบ local-only')).toBeVisible();
  await expect(hssCard.getByLabel('สำนวนคดี')).toBeVisible();
  await expect(hssCard.getByLabel('ประเภทคำค้น')).toHaveValue('FACILITY_NAME');
  await expect(hssCard.getByRole('button', { name: 'ล็อกอิน ค้น และบันทึกผล PDF อัตโนมัติ' })).toBeDisabled();
  const hssAutoLogin = hssCard.getByRole('button', { name: 'ล็อกอินและเปิดหน้าสืบค้นที่เลือก' });
  await expect(hssAutoLogin).toBeDisabled();
  await page.getByRole('checkbox', { name: /รับทราบว่า HSS ใช้ HTTP/ }).check();
  await expect(hssAutoLogin).toBeEnabled();

  const esta2Card = page.getByRole('heading', { name: 'ESTA2 สบส.' }).locator('xpath=ancestor::article[1]');
  await expect(esta2Card.getByRole('radio', { name: /สถานประกอบการที่ได้รับอนุญาตแล้ว/ })).toBeChecked();
  await expect(esta2Card.getByText('HTTPS ตรวจแล้ว')).toBeVisible();
  await expect(esta2Card.getByLabel('ประเภทคำค้น')).toHaveValue('FACILITY_NAME');
  await expect(esta2Card.getByRole('button', { name: 'ล็อกอินและเปิดหน้าสืบค้นที่เลือก' })).toBeEnabled();

  const blocked = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/HSS_OSS/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(blocked).toMatchObject({ status: 409, body: { error: { code: 'INSECURE_TRANSPORT_ACK_REQUIRED' } } });

  const allowed = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/HSS_OSS/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'HSS_FACILITY', acknowledge_insecure_transport: true }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(allowed).toMatchObject({
    status: 200,
    body: { data: { companion_uri: 'lawirisk-recon://launch?source=HSS_OSS&service=HSS_FACILITY&allow_insecure_http=1' } },
  });
  expect(JSON.stringify(allowed)).not.toMatch(/password|cookie|token/i);

  const esta2Allowed = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/HSS_ESTA2/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'HSS_HEALTH_BUSINESS_APPROVED' }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(esta2Allowed).toMatchObject({
    status: 200,
    body: { data: { companion_uri: 'lawirisk-recon://launch?source=HSS_ESTA2&service=HSS_HEALTH_BUSINESS_APPROVED' } },
  });
  expect(JSON.stringify(esta2Allowed)).not.toMatch(/password|cookie|token/i);

  const localSearch = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/HSS_OSS/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: 'case-1',
        service: 'HSS_FACILITY',
        intent: 'LOCAL_SEARCH',
        acknowledge_insecure_transport: true,
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(localSearch.status).toBe(200);
  expect(localSearch.body.data.companion_uri).toContain('case_id=case-1');
  expect(JSON.stringify(localSearch)).not.toMatch(/query|purpose|0800000000/i);

  const fdaLocalSearch = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/FDA_SKYNET/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: 'case-1',
        service: 'DBD',
        intent: 'LOCAL_SEARCH',
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(fdaLocalSearch).toMatchObject({
    status: 200,
    body: { data: { companion_uri: 'lawirisk-recon://launch?source=FDA_SKYNET&case_id=case-1&service=DBD' } },
  });
  expect(JSON.stringify(fdaLocalSearch)).not.toMatch(/query|purpose|0100000000001/i);

  const leakedQuery = await page.evaluate(async () => {
    const response = await fetch('/api/v1/sources/HSS_OSS/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: 'case-1', service: 'HSS_FACILITY', intent: 'LOCAL_SEARCH',
        acknowledge_insecure_transport: true, query: 'ข้อมูลต้องห้าม',
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(leakedQuery).toMatchObject({ status: 400, body: { error: { code: 'INVALID_REQUEST' } } });
});

test('denies source registry access to viewer role', async ({ page }) => {
  await page.context().addCookies([
    { name: 'mock-auth-logged-in', value: 'true', url: testBaseUrl },
    { name: 'mock-auth-role', value: 'VIEWER', url: testBaseUrl },
  ]);
  const response = await page.request.get('/api/v1/sources');
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
});

test('shows the n8n automation command center and fails closed in demo mode', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/automation');
  await expect(page.getByRole('heading', { level: 1, name: 'ศูนย์สั่งการระบบงานอัตโนมัติ' })).toBeVisible();
  await expect(page.getByText(/โหมดสาธิตแสดงหน้าจอและ state model เท่านั้น/)).toBeVisible();
  await expect(page.getByRole('button', { name: /ส่งเข้า n8n Pipeline/ })).toBeDisabled();
  await expect(page.getByText('n8n เห็นเฉพาะ Job ID')).toBeVisible();
});

test('exposes passkey face-scan login and self-service device management', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'สแกนใบหน้า / ลายนิ้วมือด้วย Passkey' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/security');
  await expect(page.getByRole('heading', { level: 1, name: 'สแกนใบหน้า / ลายนิ้วมือด้วย Passkey' })).toBeVisible();
  await expect(page.getByText('Windows Hello · เครื่องสาธิต')).toBeVisible();
  await expect(page.getByText(/ไม่บันทึกภาพใบหน้า/).first()).toBeVisible();
});

test('loads the demo Evidence Universe with case, evidence, and entity nodes', async ({ page }) => {
  await loginAsInvestigator(page);
  const graphResponse = await page.request.get('/api/v1/universe');
  expect(graphResponse.status()).toBe(200);
  const graph = await graphResponse.json();
  expect(graph.meta).toMatchObject({ mode: 'demo' });
  expect(graph.data.nodes.some((node: { group: string }) => node.group === 'evidence')).toBe(true);
  expect(graph.data.links.length).toBeGreaterThan(0);
  await page.goto('/universe');
  await expect(page.getByText(/ชุดข้อมูลสาธิตภายในเครื่อง/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'อ่านง่าย 2D' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'ค้นหาโหนดในผังความเชื่อมโยง' }).fill('080');
  await page.getByRole('button', { name: 'PHONE · 080-000-0000', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'PHONE · 080-000-0000' })).toBeVisible();
  await expect(page.getByRole('button', { name: /คดี ค\.123\/2569/ })).toBeVisible();
  await page.getByRole('button', { name: '3D เต็มรูปแบบ' }).click();
  await expect(page.getByRole('button', { name: 'หมุนอัตโนมัติ' })).toBeVisible();
});

test('queues multiple evidence files and reports browser validation per file', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/evidence');
  const chooser = page.locator('input[type="file"][multiple]');
  await expect(page.getByText(/ไฟล์ละไม่เกิน 200 MB/)).toBeVisible();
  await expect(page.getByText('fb_ad_screenshot.png')).toBeVisible();
  await expect(chooser).toBeEnabled();
  await chooser.setInputFiles([
    { name: 'capture-one.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) },
    { name: 'capture-two.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]) },
  ]);
  await expect(page.getByText('2/20 ไฟล์')).toBeVisible();
  await expect(page.getByText(/capture-one\.png/)).toBeVisible();
  await expect(page.getByText(/capture-two\.png/)).toBeVisible();
  await expect(page.getByText(/พร้อมอัปโหลด/)).toHaveCount(2);
});

test('runs demo OCR, keeps source trace, and reaches biometric review', async ({ page }) => {
  await page.context().addCookies([
    { name: 'mock-auth-logged-in', value: 'true', url: testBaseUrl },
    { name: 'mock-auth-role', value: 'REVIEWER', url: testBaseUrl },
    { name: 'mock-auth-name', value: encodeURIComponent('ผู้ตรวจทานสาธิต'), url: testBaseUrl },
  ]);
  await page.goto('/review');
  await page.getByLabel('เลือกสำนวนคดี').selectOption('case-1');
  await page.getByLabel('หลักฐานที่จัดเก็บและตรวจโครงสร้างแล้ว').selectOption('ev-1');
  await page.getByRole('button', { name: 'ทดลอง OCR และสกัดข้อมูล' }).click();
  await expect(page.getByText(/ประมวลผลข้อเสนอแนะสำเร็จ 1 รายการ/)).toBeVisible();
  await expect(page.getByText('DEMO_OCR_RULE_ENGINE').first()).toBeVisible();

  const firstCard = page.locator('article').filter({ hasText: 'DEMO_OCR_RULE_ENGINE' }).first();
  await firstCard.getByPlaceholder(/ระบุเหตุผลการรับรอง/).fill('ตรวจข้อความและตำแหน่งอ้างอิงแล้ว');
  await firstCard.getByRole('button', { name: 'ลงนามรับรอง' }).click();
  await expect(page.getByRole('heading', { name: 'ยืนยันการรับรองพยานหลักฐานด้วยชีวมิติ' })).toBeVisible();
  const biometricDialog = page.getByTestId('biometric-step-up-dialog');
  const dialogPosition = await biometricDialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, viewportHeight: window.innerHeight, bodyOverflow: document.body.style.overflow };
  });
  expect(dialogPosition.top).toBeGreaterThanOrEqual(0);
  expect(dialogPosition.top).toBeLessThan(dialogPosition.viewportHeight * 0.2);
  expect(dialogPosition.bottom).toBeLessThanOrEqual(dialogPosition.viewportHeight);
  expect(dialogPosition.bodyOverflow).toBe('hidden');
  await page.getByRole('button', { name: 'สแกนใบหน้า / ลายนิ้วมือเพื่อยืนยัน' }).click();
  await expect(page.getByText(/บันทึกผลการตรวจทานและบันทึกประวัติ/)).toBeVisible({ timeout: 15_000 });
});

test('selects several review items and confirms them with one biometric signature', async ({ page }) => {
  await page.context().addCookies([
    { name: 'mock-auth-logged-in', value: 'true', url: testBaseUrl },
    { name: 'mock-auth-role', value: 'REVIEWER', url: testBaseUrl },
    { name: 'mock-auth-name', value: encodeURIComponent('ผู้ตรวจทานสาธิต'), url: testBaseUrl },
  ]);
  await page.goto('/review');
  await page.getByLabel('เลือกสำนวนคดี').selectOption('case-1');
  await page.getByLabel('หลักฐานที่จัดเก็บและตรวจโครงสร้างแล้ว').selectOption('ev-1');
  await page.getByRole('button', { name: 'ทดลอง OCR และสกัดข้อมูล' }).click();
  await expect(page.getByText(/ประมวลผลข้อเสนอแนะสำเร็จ 1 รายการ/)).toBeVisible();
  await page.getByRole('button', { name: 'เลือกที่พร้อมรับรองทั้งหมด' }).click();
  await expect(page.getByText(/เลือกแล้ว 2\/2/)).toBeVisible();
  await page.getByLabel('เหตุผลร่วมสำหรับทุกรายการที่เลือก').fill('ตรวจไฟล์ต้นฉบับ หน้าเอกสาร และข้อความอ้างอิงครบทั้งสองรายการแล้ว');
  await page.getByRole('button', { name: 'ลงนามและรับรอง 2 รายการ' }).click();
  await expect(page.getByRole('heading', { name: 'ลงนามรับรองพยานหลักฐานหลายรายการ' })).toBeVisible();
  await page.getByRole('button', { name: 'สแกนครั้งเดียวเพื่อรับรอง 2 รายการ' }).click();
  await expect(page.getByText(/ลงนามครั้งเดียวและรับรอง 2 รายการเรียบร้อยแล้ว/)).toBeVisible({ timeout: 15_000 });
});

test('exports an authenticated immutable PDF snapshot', async ({ page }) => {
  await loginAsInvestigator(page);
  const response = await page.request.get('/api/v1/reports/demo-report/pdf');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(1_000);
});

test('checks report prerequisites before generating and hides invalid actions from viewers', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.goto('/reports');
  await page.getByLabel('เลือกสำนวนคดี').selectOption('case-1');
  await expect(page.getByText('พร้อมสร้างรายงาน', { exact: true })).toBeVisible();
  const generateButton = page.getByRole('button', { name: 'สร้างเอกสารรายงาน' });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();
  await expect(page.getByText('หลักฐานต้นฉบับใน snapshot', { exact: false })).toBeVisible();

  await page.context().clearCookies();
  await page.context().addCookies([
    { name: 'mock-auth-logged-in', value: 'true', url: testBaseUrl },
    { name: 'mock-auth-role', value: 'VIEWER', url: testBaseUrl },
  ]);
  await page.goto('/reports');
  await page.getByLabel('เลือกสำนวนคดี').selectOption('case-1');
  await expect(page.getByText('บัญชีนี้ไม่มีสิทธิ์สร้างรายงาน')).toBeVisible();
  await expect(page.getByRole('button', { name: 'สร้างเอกสารรายงาน' })).toBeDisabled();
});

test('lets a citizen search, submit an anonymous complaint, and track it', async ({ page }) => {
  await page.goto('/public');

  await page.getByLabel('คำค้นหาข้อมูลสาธารณะ').fill('2A36/61');
  await page.getByRole('button', { name: 'ค้นหาข้อมูล' }).click();
  await expect(page.getByRole('heading', { name: /ผลจากทะเบียนและข่าวประชาสัมพันธ์ทางการ/ })).toBeVisible();

  await page.getByRole('tab', { name: 'แจ้งเรื่องร้องเรียน / เบาะแส' }).click();
  await page.getByPlaceholder(/ถูกเพจหลอกขายสินค้า/).fill('แจ้งเบาะแสทดสอบระบบสาธารณะ');
  await page.getByPlaceholder(/ระบุข้อความแชต/).fill('ข้อมูลสังเคราะห์สำหรับทดสอบเส้นทางรับเรื่องและติดตามสถานะเท่านั้น');
  await page.getByRole('checkbox', { name: /ไม่ประสงค์ออกนาม/ }).check();
  await page.getByRole('button', { name: 'ส่งเรื่องร้องเรียน' }).click();
  await expect(page.getByRole('heading', { name: 'บันทึกเรื่องร้องเรียนเรียบร้อยแล้ว' })).toBeVisible();

  const token = (await page.locator('text=/TRK-\\d{4}-[A-F0-9]{12}/').last().textContent())?.trim();
  expect(token).toMatch(/^TRK-\d{4}-[A-F0-9]{12}$/);
  await page.getByRole('button', { name: 'ไปที่หน้าติดตามสถานะ' }).click();
  await page.getByRole('button', { name: 'ตรวจสอบ', exact: true }).click();
  await expect(page.getByText('รอดำเนินการคัดกรอง')).toBeVisible();
});

test('collects public satisfaction feedback and exposes only protected aggregate statistics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/public');
  await page.getByLabel('คำค้นหาข้อมูลสาธารณะ').fill('2A36/61');
  await page.getByRole('button', { name: 'ค้นหาข้อมูล' }).click();
  await expect(page.getByRole('heading', { name: 'แบบประเมินเพื่อพัฒนางานประจำ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  for (const score of [5, 4, 5, 4]) {
    await page.getByRole('button', { name: new RegExp(`^${score} ดาว`) }).click();
    await page.getByRole('button', { name: 'คำถามถัดไป' }).click();
  }
  await page.getByLabel('ข้อเสนอแนะ').fill('แบบประเมินสั้น กระชับ และใช้งานบนมือถือได้ง่าย');
  await page.getByRole('button', { name: 'ส่งแบบประเมิน' }).click();
  await expect(page.getByRole('heading', { name: 'ขอบคุณสำหรับคะแนนและข้อเสนอแนะ' })).toBeVisible();

  const idempotencyResult = await page.evaluate(async () => {
    const payload = {
      audience: 'PUBLIC', context: 'PUBLIC_SEARCH', interactionId: crypto.randomUUID(),
      convenience: 4, speed: 4, accuracy: 4, overall: 4, suggestion: '',
    };
    const first = await fetch('/api/v1/satisfaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const second = await fetch('/api/v1/satisfaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { firstStatus: first.status, secondStatus: second.status, secondBody: await second.json() };
  });
  expect(idempotencyResult).toMatchObject({ firstStatus: 201, secondStatus: 200, secondBody: { data: { duplicate: true } } });

  const anonymousSummary = await page.request.get('/api/v1/satisfaction');
  expect(anonymousSummary.status()).toBe(401);

  await loginAsInvestigator(page);
  const protectedSummary = await page.request.get('/api/v1/satisfaction');
  expect(protectedSummary.status()).toBe(200);
  await expect(protectedSummary.json()).resolves.toMatchObject({
    data: {
      totalResponses: expect.any(Number),
      satisfactionPercent: expect.any(Number),
      audiences: { PUBLIC: { totalResponses: expect.any(Number) }, STAFF: { totalResponses: expect.any(Number) } },
    },
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/satisfaction');
  await expect(page.getByRole('heading', { level: 1, name: 'ภาพรวมความพึงพอใจของผู้ใช้งาน' })).toBeVisible();
  await expect(page.getByText('คะแนนรายมิติ')).toBeVisible();
  await expect(page.getByText('ประชาชน · หลังค้นหาข้อมูล').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('invites staff to rate the tool after two minutes of session use', async ({ page }) => {
  await loginAsInvestigator(page);
  await page.evaluate(() => {
    sessionStorage.setItem('lawirisk-satisfaction-session-started-at', String(Date.now() - 121_000));
    sessionStorage.removeItem('lawirisk-satisfaction-session-completed');
  });
  await page.reload();
  const evaluationButton = page.getByRole('button', { name: 'เปิดแบบประเมินความพึงพอใจหลังใช้งาน 2 นาที' });
  await expect(evaluationButton).toBeVisible();
  await evaluationButton.click();
  const survey = page.getByRole('dialog', { name: 'แบบประเมินความพึงพอใจสำหรับเจ้าหน้าที่' });
  await expect(survey).toBeVisible();
  for (const score of [4, 4, 5, 4]) {
    await survey.getByRole('button', { name: new RegExp(`^${score} ดาว`) }).click();
    await survey.getByRole('button', { name: 'คำถามถัดไป' }).click();
  }
  await survey.getByLabel('ข้อเสนอแนะ').fill('ควรจำค่าตัวกรองล่าสุดของเจ้าหน้าที่');
  await survey.getByRole('button', { name: 'ส่งแบบประเมิน' }).click();
  await expect(survey).toBeHidden();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('lawirisk-satisfaction-session-completed'))).toBe('true');
});
