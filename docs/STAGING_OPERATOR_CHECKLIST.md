# Staging operator checklist

เอกสารนี้คือขั้นตอนที่เจ้าของบัญชีต้องทำหลังจาก quality gates ใน repository ผ่านแล้ว ห้ามใส่ secret ใน Git, issue, อีเมล หรือแชต

## 0. เหตุฉุกเฉิน: หมุน Supabase service-role key

- [ ] เข้า Supabase project ที่เคยใช้กับ repository นี้และ rotate/revoke service-role key เดิม
- [ ] ตรวจ Auth, Database และ Storage logs ตั้งแต่วันที่ key ถูก commit
- [ ] สร้าง key ใหม่และเก็บใน Supabase/Cloudflare secret manager เท่านั้น
- [ ] ทำให้ repository เป็น private ชั่วคราวจนกว่าจะล้าง Git history และตรวจว่าการ force-push จะไม่กระทบ clone/branch ของทีม
- [ ] แจ้งทีมให้ลบ clone/artefact/cache เก่าหลังล้าง history

การลบ key ออกจาก commit ล่าสุดไม่ทำให้ key หายจาก Git history จึงต้อง rotate ก่อนเสมอ การ rewrite history และ force-push ต้องให้ repository owner อนุมัติแยกต่างหาก

## 1. สร้าง staging แยกจาก production

- [ ] สร้าง Supabase staging project และบันทึก project ref
- [ ] เปิด backup/PITR ตาม RPO/RTO ที่องค์กรอนุมัติ
- [ ] สร้าง Cloudflare Worker environment และ staging domain แบบ HTTPS
- [ ] สร้าง n8n staging workflow แยกจาก production
- [ ] เตรียม Gemini staging key หลังผ่าน DPA, residency และ retention review
- [ ] ยืนยันว่า Worker ไม่มี malware-scanner binding/secret ตาม product scope ปัจจุบัน

## 2. ตั้งค่า local staging file

คัดลอก `.env.staging.example` เป็น `.env.staging.local` แล้วกรอกค่าบนเครื่องผู้ดูแล ไฟล์ปลายทางถูก Git ignore ไว้แล้ว

```powershell
Copy-Item -LiteralPath '.env.staging.example' -Destination '.env.staging.local'
pnpm staging:preflight
```

ห้ามดำเนินการต่อจน configuration checks ผ่านทั้งหมด จากนั้นตรวจ network:

```powershell
pnpm staging:preflight:network
pnpm staging:live:verify
pnpm staging:anonymous:verify
```

`staging:preflight` ตรวจค่าจาก process/`.env.staging.local` เท่านั้นและไม่สามารถอ่านค่าลับออกจาก Cloudflare ได้ หาก deploy โดยเก็บ secret ใน Cloudflare ให้ถือ `staging:live:verify` และ `staging:anonymous:verify` เป็นหลักฐานของ runtime ที่ deploy แล้ว โดย preflight local ที่ไม่มีไฟล์จะยัง fail เพื่อป้องกันการเข้าใจผิดว่าเครื่อง operator พร้อมใช้งาน

## 3. ตรวจ migration ก่อน apply

```powershell
pnpm supabase:link
pnpm supabase:migrate:dry
```

- [ ] เก็บ output ของ dry-run ไว้ใน release evidence
- [ ] DB owner ตรวจ lock, destructive statements และ forward-recovery
- [ ] apply เฉพาะ staging หลังอนุมัติ

```powershell
pnpm supabase:migrate
```

## 4. สร้างบัญชีทดสอบและพิสูจน์ RLS

```powershell
pnpm staging:users:plan
pnpm staging:users:apply
```

- [ ] ADMIN
- [ ] INVESTIGATOR A เป็นสมาชิก case A
- [ ] INVESTIGATOR B เป็นสมาชิก case B
- [ ] REVIEWER ที่ได้รับมอบหมาย
- [ ] VIEWER
- [ ] ผู้ใช้ authenticated ที่ไม่เป็นสมาชิกคดี
- [ ] anonymous

ต้องพิสูจน์ว่า wrong-case, wrong-role, unassigned และ anonymous ถูกปฏิเสธทั้ง API และ RLS ไม่ใช่เพียงซ่อนปุ่มในหน้าเว็บ

## 5. Evidence acceptance

- [ ] bucket `evidence-vault` เป็น private และไม่มี public write/read policy
- [ ] PDF/PNG/JPEG ที่ extension, MIME และ magic bytes ตรงกันผ่าน
- [ ] ไฟล์ว่าง, path traversal, MIME mismatch และเกิน 200 MB ถูกปฏิเสธ
- [ ] TUS หยุดและ resume ได้โดยไม่สร้างต้นฉบับซ้ำ
- [ ] Worker ตรวจขนาด, MIME และ magic bytes ก่อน finalize; object หายหรือค่าไม่ตรงต้องถูกปฏิเสธ
- [ ] `STORED/NOT_SCANNED` ใช้งานได้; `RESERVED`, `FAILED` และ confirmed `INFECTED` เปิด/ส่ง AI/ออกรายงานไม่ได้
- [ ] เฉพาะ `CLEAN` ได้ signed URL อายุสั้นสำหรับสมาชิกคดีปัจจุบัน
- [ ] ไฟล์ 200 MB ไม่ถูกโหลดเข้า Worker/Gemini memory; Vision OCR จำกัด 20 MB

## 6. Passkey, integrations และ Cloudflare

- [ ] Passkey enrollment/login/revoke ผ่านอย่างน้อยสอง authenticator บน HTTPS origin จริง
- [ ] counter replay, wrong RP ID, wrong origin และ credential ที่ถูก revoke ถูกปฏิเสธ
- [ ] n8n timeout/retry/idempotency และ callback token separation ผ่าน
- [ ] Gemini invalid schema/timeout/provider unavailable จบเป็น error หรือ manual fallback ไม่ใช่ success
- [ ] Kouprey HMAC replay และ Partner bearer-key rotation ผ่านก่อนเปิด endpoint
- [ ] `/api/health` ตอบ `200/ready` บน staging
- [ ] WAF, TLS, body limit, 5xx/latency alerts และ log redaction ผ่าน
- [ ] deploy canary แล้ว rollback Worker version ก่อนหน้าได้

Recon workspace 10 มิติและ local Recon Companion เปิดใช้ได้แล้ว ให้ทดสอบ `pnpm recon:install`, DPAPI setup, SKYNET auto-login/MFA pause และ HSS HTTP acknowledgement บนเครื่อง staging แยก Adapter เปิดหน้าค้น DBD/DOPA/ทะเบียนยาและ HSS สถานพยาบาล/บุคคลถูก allowlist แล้ว ส่วน batch search, การส่งคำค้นอัตโนมัติ, สภาวิชาชีพ และ geocoding ยังต้องผ่าน contract/security/privacy acceptance ห้ามสร้างผลอัตโนมัติจาก fixture หรือการเดาชื่อบุคคล

## 7. Restore drill และ sign-off

- [ ] restore database ไปยัง Supabase project อื่น ไม่ restore ทับ staging ที่ใช้งานอยู่
- [ ] ตรวจจำนวน case, membership, evidence metadata, audit และ report snapshot
- [ ] ตรวจ private Storage objects และ hash กับ metadata
- [ ] บันทึกเวลาที่ใช้จริงเทียบ RTO และจุดข้อมูลล่าสุดเทียบ RPO
- [ ] Product, Security/DPO, DB, Cloudflare และ incident/backup owner ลงนาม

ห้ามใช้ข้อมูลจริงหรือประกาศ production-ready จนกว่าทุกข้อที่เกี่ยวข้องจะมีหลักฐานการทดสอบจริง
