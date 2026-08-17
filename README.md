# EvidenceVerse Lite

ระบบช่วยจัดระเบียบ ตรวจทาน และเชื่อมโยงหลักฐานดิจิทัล โดยทุกข้อเสนอจาก AI ต้องผ่านการยืนยันของมนุษย์และย้อนกลับถึงหลักฐานต้นฉบับได้ ระบบนี้ไม่ใช้ตัดสินความผิด ตัวตน เจตนา ความเป็นเจ้าของ หรือความรับผิดโดยอัตโนมัติ

## Stack

- Next.js 16 App Router, React 19 และ TypeScript แบบ strict
- Tailwind CSS 4
- Supabase Auth, PostgreSQL RLS และ Private Storage
- Zod สำหรับ validation ที่ API boundary
- Vitest และ ESLint

## เริ่มใช้งาน

ต้องใช้ Node.js และ pnpm ตาม lockfile ของโครงการ

```bash
pnpm install --frozen-lockfile
pnpm dev
```

เปิด `http://localhost:3000` หากยังไม่ได้ตั้งค่า Supabase ระบบจะทำงานในโหมดสาธิตและเก็บข้อมูล UI บางส่วนใน `localStorage` ของ browser เท่านั้น

คัดลอก `.env.example` เป็น `.env.local` และตั้งค่าเฉพาะค่าที่ใช้งานจริง ห้ามนำ service-role key, webhook secret หรือ partner key ไปไว้ในตัวแปร `NEXT_PUBLIC_*`

## Quality gates

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

## ขอบเขตความปลอดภัยสำคัญ

- หน้าใช้งานหลักผ่าน `src/proxy.ts` เพื่อเช็ก session ในเบื้องต้น แต่ authorization จริงยังต้องบังคับด้วย route handler และ PostgreSQL RLS
- หน้า admin ตรวจ role ซ้ำใน server layout
- ไฟล์หลักฐานรองรับ PDF, PNG และ JPEG สูงสุด 20 MB โดยตรวจ extension, MIME, magic bytes และ SHA-256 ทั้ง client และ server
- หลักฐานใหม่เริ่มสถานะ `PENDING`; ห้ามถือว่าปลอดภัยจนกว่าจะมีผลสแกน `CLEAN` ที่ชัดเจน
- object path ของหลักฐานสร้างด้วย UUID ฝั่ง server และ bucket ต้องเป็น private
- webhook Kouprey ต้องมี HMAC, timestamp, nonce และ `Idempotency-Key`; ไม่มี fallback secret
- Partner API ต้องตั้ง `PARTNER_API_KEYS` และส่ง bearer key ที่ตรงกับ partner id
- migration `202608170001_security_hardening.sql` ปิด role escalation, cross-case reads, เพิ่ม intake RLS และ private Storage policies
- migration `202608170002_persistence_foundation.sql` ทำ role contract ให้เป็นมาตรฐาน เพิ่ม channel code/index และ transactional RPC สำหรับสร้างคดี รับคำร้อง และบันทึกผลคัดกรองพร้อม audit

## ก่อนนำขึ้น production

โหมดสาธิตยังใช้ in-memory/localStorage เมื่อไม่ได้ตั้งค่า Supabase ส่วนเส้นทางคดี, คิวรับเรื่อง, manual intake, Kouprey, Partner API และ triage ใช้ Supabase persistence เมื่อมี configuration จริง งานที่ยังต้องทำก่อน production คือ parser สำหรับ file import, malware scanner, rate limiter แบบ shared store และการทดสอบ RLS/Storage กับ Supabase environment จริง
