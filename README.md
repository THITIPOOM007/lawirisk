# EvidenceVerse Lite

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

## Quality gates

```bash
pnpm quality
pnpm test:e2e
pnpm audit:prod
pnpm peers check
pnpm build:vinext
```

## หลักความปลอดภัย

- API ตรวจ session/role ซ้ำจาก server และ PostgreSQL RLS เป็นแนวป้องกันหลัก
- mutation จาก browser ตรวจ Origin และใช้ shared rate limit ใน PostgreSQL
- หลักฐานรองรับ PDF/PNG/JPEG สูงสุด 20 MB ตรวจ MIME, magic bytes, SHA-256 และ scanner ภายนอก
- object path ไม่เปิดเผยต่อ client; ดาวน์โหลดผ่าน signed URL 60 วินาที เฉพาะไฟล์ `STORED/CLEAN`
- metadata ต้นฉบับและ audit เป็น append-only/immutable ด้วย database trigger
- extraction/match เป็นข้อเสนอ; การยืนยันต้องมี source และหลักฐานที่สแกน `CLEAN`
- รายงานเก็บ source snapshot และ SHA-256; ไม่มี source จะสร้างไม่ได้
- CSV import เป็น UTF-8 สูงสุด 2 MB/1,000 แถว และบันทึก batch ผ่าน RPC ธุรกรรมเดียว
- Kouprey ใช้ HMAC/timestamp/nonce/idempotency; Partner API ใช้ bearer key/idempotency และไม่มี production demo fallback

รายละเอียดติดตั้งจริงและรายการที่ต้องจัดเตรียมอยู่ที่ [Production readiness](docs/PRODUCTION_READINESS.md)
