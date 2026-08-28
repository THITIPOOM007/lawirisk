# LAW-i-RISK Recon Companion

Recon Companion เป็นโปรแกรมบนเครื่อง Windows สำหรับกรอกบัญชีและกดเข้าสู่ระบบของแหล่งราชการที่อนุญาต โดย LAW-i-RISK บน Cloudflare/Supabase ไม่ได้รับ username, password, cookie หรือ session ของระบบต้นทาง

## ขอบเขตที่ใช้งานได้

- `FDA_SKYNET`: เริ่มจากหน้า Privus คงที่เพื่อให้ระบบสร้าง DGA OIDC/PKCE `state`, `nonce` และ `code_challenge` ใหม่ทุกครั้ง จากนั้นกรอกบัญชีและกดเข้าสู่ระบบอัตโนมัติ
- `HSS_OSS`: กรอกบัญชีและกดเข้าสู่ระบบอัตโนมัติได้เมื่อผู้ใช้ยืนยันความเสี่ยง HTTP ใน LAW-i-RISK ทุกครั้ง
- `HSS_ESTA2`: กรอกบัญชีผ่าน HTTPS เปิดหน้า `https://esta2.hss.moph.go.th/business/approved` และค้นชื่อผู้ยื่น เลขบัตรผู้ยื่น ชื่อสถานประกอบการไทย/อังกฤษ หรือเลขใบอนุญาตแบบ local-only
- เลือกบริการย่อยจากหน้า LAW-i-RISK ได้: FDA DBD, FDA DOPA, สถานที่/ทะเบียนยา, ข้อมูลสถานพยาบาล HSS และข้อมูลผู้ประกอบโรคศิลปะ HSS
- FDA DBD รองรับค้นเลขนิติบุคคล 13 หลัก และ FDA DOPA รองรับค้นเลขบัตรประชาชน 13 หลักแบบ exact local-only หลังตรวจยืนยัน Angular field contract `ENTRE_IDENTIFY` และ `CTZNO`; ผลบันทึกเป็น PDF พร้อม SHA-256 และรอมนุษย์ตรวจ
- หลังล็อกอิน Companion เปิดหน้าค้นที่เลือกโดยตรง และบันทึก page contract แบบไม่เก็บค่าในช่องกรอกไว้ใน `%LOCALAPPDATA%\LawiRisk-SSK\recon-page-contracts`
- HSS OSS และ ESTA2 รองรับการค้นอัตโนมัติแบบ local-only: เลือกคดี ประเภทคำค้น ระบุวัตถุประสงค์ และยืนยันอำนาจหน้าที่ใน LAW-i-RISK จากนั้น Companion จะกรอก กดค้น และบันทึกผลที่แสดงเป็น PDF พร้อม SHA-256 ไว้ใน `%LOCALAPPDATA%\LawiRisk-SSK\recon-results`
- สำหรับชื่อสถานพยาบาล/สถานประกอบการ Companion จะลองแบบจำกัดสูงสุด 3 ระดับ ได้แก่ชื่อเต็ม ชื่อแกนที่ตัดคำทั่วไป และคำสำคัญแรก แล้วหยุดเมื่อพบผล ส่วนเลขบัตร ใบอนุญาต โทรศัพท์ และชื่อบุคคลค้นตรงเท่านั้น
- OTP, QR, MFA และ CAPTCHA ไม่ถูกข้าม โปรแกรมจะหยุดรอเจ้าหน้าที่ในหน้าต่างเบราว์เซอร์
- FDA สถานที่และทะเบียนยายังเป็นโหมดเปิดฟอร์มเท่านั้น ส่วน DBD/DOPA เปิด auto-search เฉพาะเลข 13 หลักที่ตรวจ field contract แล้ว การค้นชื่อ DOPA ยังไม่เปิดเพราะเป็นคนละหน้าและยังไม่ได้ตรวจ contract

## ติดตั้งบนเครื่องเจ้าหน้าที่

ต้องติดตั้ง dependencies ของโครงการและ Chromium ของ Playwright ก่อน:

```powershell
pnpm install
pnpm exec playwright install chromium
pnpm recon:selftest
pnpm recon:install
```

`pnpm recon:install` ทำสองส่วนสำหรับ Windows user ปัจจุบัน:

- ลงทะเบียน URL protocol `lawirisk-recon://` ที่ `HKCU\Software\Classes\lawirisk-recon` เป็นช่องทางสำรอง
- เปิด local bridge ที่ `http://127.0.0.1:32147` และตั้งให้เริ่มพร้อม Windows เพื่อรองรับเบราว์เซอร์ที่ไม่ส่ง custom URL protocol ไปยังระบบปฏิบัติการ

local bridge bind เฉพาะ loopback, รับคำสั่งจาก origin ของ LAW-i-RISK ที่ allowlist, บังคับ CORS/private-network preflight และรับเฉพาะ companion URI ที่ผ่าน allowlist เดิม จึงไม่มี username/password ผ่าน Cloudflare หรือ Supabase ย้อนกลับได้ด้วย `pnpm recon:uninstall`

สำหรับ HSS คำค้นและวัตถุประสงค์เดินทางจากหน้าเว็บไป local bridge บน `127.0.0.1` โดยตรง และอยู่ในหน่วยความจำเป็นงาน one-time ไม่เกิน 2 นาที งานถูกลบทันทีเมื่อ Companion รับไป ค่าเหล่านี้ไม่ถูกใส่ใน cloud API, audit, companion URI หรือ command line Metadata เก็บเฉพาะ SHA-256 ของคำค้นแต่ละระดับ กลยุทธ์ จำนวนครั้ง และจำนวนแถวผลลัพธ์ ไม่เก็บคำค้นดิบ อย่างไรก็ตาม PDF ผลค้นอาจแสดงคำค้นสุดท้ายตามที่ระบบต้นทางแสดง และต้องถือเป็นข้อมูลคดีที่ต้องนำเข้าคลังหลักฐานหรือกำจัดตามระเบียบ
`pnpm recon:selftest` ตรวจ round-trip ของ Windows DPAPI ด้วยค่าชั่วคราวใน memory โดยไม่สร้างหรือแก้ credential จริง

## ตั้งบัญชีครั้งแรก

ตั้งผ่านปุ่ม “ตั้ง/เปลี่ยนบัญชีบนเครื่องนี้” ในหน้าแหล่งสืบค้น หรือใช้คำสั่ง:

```powershell
pnpm recon:setup:fda
pnpm recon:setup:hss
pnpm recon:setup:esta2
```

PowerShell รับรหัสผ่านแบบ SecureString และบันทึก payload ที่เข้ารหัสด้วย Windows DPAPI ใน `%LOCALAPPDATA%\LawiRisk-SSK\recon-credentials` ไฟล์ถอดรหัสได้เฉพาะ Windows user เดิมบนเครื่องเดิม รหัสผ่านไม่ควรใส่ใน `.env`, command line, URL, Git, log หรือช่องแชต

## ทดสอบโดยตรง

```powershell
pnpm recon:launch:fda
pnpm recon:launch:hss
pnpm recon:launch:esta2
```

คำสั่ง HSS มีการยอมรับ HTTP อยู่ใน command line สำหรับการทดสอบเฉพาะเครื่อง หน้า LAW-i-RISK จะบังคับ checkbox ยืนยันใหม่ทุกครั้งก่อนออก companion URI

## หลักประกันความปลอดภัย

- source key ถูก allowlist เฉพาะ `FDA_SKYNET`, `HSS_OSS` และ `HSS_ESTA2`
- companion URI มีเพียง source key, case ID และ risk acknowledgement ไม่มี credential/token/cookie
- cloud companion API ใช้ strict schema และปฏิเสธ `query`/`purpose`; audit เก็บเพียงผู้ใช้ แหล่ง บริการ คดี เจตนา และผลอนุญาต
- service key ถูกตรวจแบบ source-bound; เช่น HSS ไม่สามารถสั่งเปิด DOPA ได้
- browser profile และ credential อยู่ใน LocalAppData ไม่ถูกอัปโหลด
- local bridge ฟังเฉพาะ `127.0.0.1` และไม่รับ arbitrary URL, credential หรือคำสั่งจากเว็บไซต์อื่น
- API companion launch ตรวจ session, role, trusted origin, rate limit, case access และเขียน audit
- HSS HTTPS ถูกตรวจแล้วว่าย้อนกลับ `http://oss.hss.moph.go.th/auth/login`; ควรย้ายไป HTTPS/API ที่หน่วยงานรับรองโดยเร็ว
- ESTA2 ใช้ HTTPS และ Companion อนุญาตนำทางเฉพาะ `esta2.hss.moph.go.th/login` กับ `/business/approved`; จะหยุดทันทีหากชื่อ option, ฟอร์ม, URL หรือผลลัพธ์ไม่ตรง contract และไม่แตะปุ่มแก้ไข/ยกเลิก/พิมพ์เอกสาร

## ส่วนที่ยังต้องมีสัญญาการเชื่อมต่อจากหน่วยงานต้นทาง

หน้าค้นจริงถูกตรวจแล้วว่า HSS รองรับการค้นชื่อสถานพยาบาล ชื่อบุคคล เลขใบอนุญาต เบอร์โทร และที่อยู่ตามสิทธิ์บัญชี และ Companion รองรับ one-at-a-time local search แล้ว FDA DBD/DOPA รองรับเลข 13 หลักแล้ว ส่วนการค้นชื่อ DOPA, สถานที่/ทะเบียนยา และ batch search ยังต้องตรวจหน้าจริงและขอบเขตที่หน่วยงานเจ้าของระบบอนุมัติสำหรับ:

1. ฟอร์มค้นและ field mapping
2. ผลลัพธ์หลายหน้า/กรณีไม่พบ
3. export PDF/ภาพและเลขอ้างอิงของ FDA (HSS มี local PDF capture แล้ว)
4. source URL, timestamp, adapter version และ response hash
5. การนำไฟล์ผลค้นจากเครื่องเข้าสู่คลังหลักฐานส่วนตัวโดยอัตโนมัติและสถานะ `SUGGESTED`
6. human review ก่อนยืนยันตัวบุคคล ใบอนุญาต ความสัมพันธ์ หรือข้อกล่าวหา

ผล “ไม่พบ” ต้องไม่ถูกตีความอัตโนมัติว่าไม่มีใบอนุญาตหรือกระทำผิด
