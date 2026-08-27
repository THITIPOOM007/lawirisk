# LawiRisk-SSK

ระบบจัดระเบียบ ตรวจทาน และเชื่อมโยงหลักฐานดิจิทัล โดยข้อเสนอทุกชนิดต้องผ่านการยืนยันของมนุษย์และย้อนกลับถึงหลักฐานต้นฉบับได้ ระบบไม่ใช้ตัดสินความผิด ตัวตน เจตนา ความเป็นเจ้าของ หรือความรับผิดโดยอัตโนมัติ

## Stack

- Next.js 16.3 / React 19 / TypeScript strict
- Supabase Auth, PostgreSQL RLS และ private Storage
- Cloudflare Workers ผ่าน vinext
- Vitest และ Playwright

## เริ่มพัฒนา

```bash
pnpm install --frozen-lockfile
pnpm dev
```

คัดลอก `.env.example` เป็น `.env.local` สำหรับเครื่องพัฒนา เมื่อไม่มี Supabase ระบบสาธิตจะเปิดได้เฉพาะ non-production และเก็บข้อมูลจำลองใน browser เท่านั้น Production จะ fail closed และส่ง `/api/health` เป็น 503 ถ้าค่าบังคับไม่ครบ

วิธีตั้ง Gemini, Cloudflare secrets และข้อจำกัดของ SKYNET/OSS อยู่ที่ [Secrets and connectors](docs/SECRETS_AND_CONNECTORS.md)

การตั้งบัญชีแบบ DPAPI และ auto-login สำหรับ SKYNET/OSS บนเครื่อง Windows อยู่ที่ [Recon Companion](docs/RECON_COMPANION.md)

n8n Automation Command Center, workflow import และ trust boundary อยู่ที่ [n8n Automation V1](docs/N8N_AUTOMATION.md)

## Quality gates

```bash
pnpm quality
pnpm test:e2e
pnpm audit:prod
pnpm build:vinext
```

## หลักความปลอดภัย

- API ตรวจ session/role ซ้ำจาก server และ PostgreSQL RLS เป็นแนวป้องกันหลัก
- mutation จาก browser ตรวจ Origin และใช้ shared rate limit ใน PostgreSQL
- หลักฐานรองรับ PDF/PNG/JPEG สูงสุด 200 MB อัปโหลดตรงแบบ TUS resumable ไป private Storage แล้วตรวจขนาด MIME และ magic bytes จาก object ก่อนยืนยัน
- หน้า Evidence รองรับลากวาง/เลือกพร้อมกันสูงสุด 20 ไฟล์และถ่ายภาพจากกล้องมือถือ โดยรายงานผลสำเร็จ/ล้มเหลวแยกรายไฟล์
- object path ไม่เปิดเผยต่อ client; ดาวน์โหลดผ่าน signed URL 60 วินาทีเฉพาะไฟล์ที่จัดเก็บและผ่านการตรวจขนาด/MIME/magic bytes (`STORED/CLEAN` หรือ `STORED/NOT_SCANNED`)
- metadata ต้นฉบับและ audit เป็น append-only/immutable ด้วย database trigger
- extraction/match เป็นข้อเสนอ; การยืนยันต้องมี source และหลักฐานที่จัดเก็บและตรวจรูปแบบสมบูรณ์
- การเข้าใช้ระบบและลงนามรับรองรองรับ WebAuthn Passkey (Windows Hello, Face ID, Touch ID, security key) พร้อมหน้าจัดการอุปกรณ์; ข้อมูลชีวมิติอยู่บนอุปกรณ์และ production ไม่มี simulated passkey fallback
- public portal รองรับค้นหา ส่งคำร้องแบบไม่เปิดเผยตัว และติดตามด้วย opaque token; ไฟล์แนบอยู่ใน private Storage และผ่านการตรวจชนิด/โครงสร้าง
- Gemini text/Vision extraction ทำงานฝั่งเซิร์ฟเวอร์กับข้อความหรือภาพ/PDF ที่พร้อมใช้งาน ผลถูก validate และบันทึกเป็น `SUGGESTED`; manual fallback ยังคงใช้งานได้
- รายงานเก็บ source snapshot และ SHA-256; ไม่มี source จะสร้างไม่ได้
- CSV import เป็น UTF-8 สูงสุด 2 MB/1,000 แถว และบันทึก batch ผ่าน RPC ธุรกรรมเดียว
- Kouprey ใช้ HMAC/timestamp/nonce/idempotency; Partner API ใช้ bearer key/idempotency และไม่มี production demo fallback

รายละเอียดติดตั้งจริงและรายการที่ต้องจัดเตรียมอยู่ที่ [Production readiness](docs/PRODUCTION_READINESS.md)
