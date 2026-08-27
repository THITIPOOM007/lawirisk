# LAW-i-RISK Recon Companion

Recon Companion เป็นโปรแกรมบนเครื่อง Windows สำหรับกรอกบัญชีและกดเข้าสู่ระบบของแหล่งราชการที่อนุญาต โดย LAW-i-RISK บน Cloudflare/Supabase ไม่ได้รับ username, password, cookie หรือ session ของระบบต้นทาง

## ขอบเขตที่ใช้งานได้

- `FDA_SKYNET`: เริ่มจากหน้า Privus คงที่เพื่อให้ระบบสร้าง DGA OIDC/PKCE `state`, `nonce` และ `code_challenge` ใหม่ทุกครั้ง จากนั้นกรอกบัญชีและกดเข้าสู่ระบบอัตโนมัติ
- `HSS_OSS`: กรอกบัญชีและกดเข้าสู่ระบบอัตโนมัติได้เมื่อผู้ใช้ยืนยันความเสี่ยง HTTP ใน LAW-i-RISK ทุกครั้ง
- เลือกบริการย่อยจากหน้า LAW-i-RISK ได้: FDA DBD, FDA DOPA, สถานที่/ทะเบียนยา, ข้อมูลสถานพยาบาล HSS และข้อมูลผู้ประกอบโรคศิลปะ HSS
- หลังล็อกอิน Companion เปิดหน้าค้นที่เลือกโดยตรง และบันทึกเฉพาะ page contract แบบไม่เก็บค่าในช่องกรอกไว้ใน `%LOCALAPPDATA%\LawiRisk-SSK\recon-page-contracts`
- OTP, QR, MFA และ CAPTCHA ไม่ถูกข้าม โปรแกรมจะหยุดรอเจ้าหน้าที่ในหน้าต่างเบราว์เซอร์
- Companion ยังไม่ส่งคำค้นหรือกดค้นอัตโนมัติ เพื่อไม่ใส่ข้อมูลบุคคลผิดแหล่ง/ผิดวัตถุประสงค์ และไม่ส่งข้อมูลค้นผ่าน Cloudflare, URL หรือ command line

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
`pnpm recon:selftest` ตรวจ round-trip ของ Windows DPAPI ด้วยค่าชั่วคราวใน memory โดยไม่สร้างหรือแก้ credential จริง

## ตั้งบัญชีครั้งแรก

ตั้งผ่านปุ่ม “ตั้ง/เปลี่ยนบัญชีบนเครื่องนี้” ในหน้าแหล่งสืบค้น หรือใช้คำสั่ง:

```powershell
pnpm recon:setup:fda
pnpm recon:setup:hss
```

PowerShell รับรหัสผ่านแบบ SecureString และบันทึก payload ที่เข้ารหัสด้วย Windows DPAPI ใน `%LOCALAPPDATA%\LawiRisk-SSK\recon-credentials` ไฟล์ถอดรหัสได้เฉพาะ Windows user เดิมบนเครื่องเดิม รหัสผ่านไม่ควรใส่ใน `.env`, command line, URL, Git, log หรือช่องแชต

## ทดสอบโดยตรง

```powershell
pnpm recon:launch:fda
pnpm recon:launch:hss
```

คำสั่ง HSS มีการยอมรับ HTTP อยู่ใน command line สำหรับการทดสอบเฉพาะเครื่อง หน้า LAW-i-RISK จะบังคับ checkbox ยืนยันใหม่ทุกครั้งก่อนออก companion URI

## หลักประกันความปลอดภัย

- source key ถูก allowlist เฉพาะ `FDA_SKYNET` และ `HSS_OSS`
- companion URI มีเพียง source key, case ID และ risk acknowledgement ไม่มี credential/token/cookie
- service key ถูกตรวจแบบ source-bound; เช่น HSS ไม่สามารถสั่งเปิด DOPA ได้
- browser profile และ credential อยู่ใน LocalAppData ไม่ถูกอัปโหลด
- local bridge ฟังเฉพาะ `127.0.0.1` และไม่รับ arbitrary URL, credential หรือคำสั่งจากเว็บไซต์อื่น
- API companion launch ตรวจ session, role, trusted origin, rate limit, case access และเขียน audit
- HSS HTTPS ถูกตรวจแล้วว่าย้อนกลับ `http://oss.hss.moph.go.th/auth/login`; ควรย้ายไป HTTPS/API ที่หน่วยงานรับรองโดยเร็ว

## ส่วนที่ยังต้องมีสัญญาการเชื่อมต่อจากหน่วยงานต้นทาง

หน้าค้นจริงถูกตรวจแล้วว่า HSS รองรับการค้นชื่อสถานพยาบาล ชื่อบุคคล เลขใบอนุญาต เบอร์โทร และที่อยู่ตามสิทธิ์บัญชี ส่วน FDA มีทางเข้า DBD/DOPA/สถานที่และทะเบียนยา การทำ batch search หรือส่งคำค้นอัตโนมัติยังต้องมี adapter ที่หน่วยงานเจ้าของระบบอนุมัติสำหรับ:

1. ฟอร์มค้นและ field mapping
2. ผลลัพธ์หลายหน้า/กรณีไม่พบ
3. export PDF/ภาพและเลขอ้างอิง
4. source URL, timestamp, adapter version และ response hash
5. การนำเข้าคลังหลักฐานส่วนตัวและสถานะ `SUGGESTED`
6. human review ก่อนยืนยันตัวบุคคล ใบอนุญาต ความสัมพันธ์ หรือข้อกล่าวหา

ผล “ไม่พบ” ต้องไม่ถูกตีความอัตโนมัติว่าไม่มีใบอนุญาตหรือกระทำผิด
