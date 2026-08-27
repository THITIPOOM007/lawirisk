# Production readiness runbook

เอกสารนี้แยก “ผ่านจาก source/local” ออกจาก “ต้องพิสูจน์บน environment จริง” เพื่อไม่ให้การ build ผ่านถูกตีความว่าอนุมัติใช้งานข้อมูลจริงแล้ว

## สถานะที่พิสูจน์แล้ว

- ESLint, TypeScript, unit tests, Next production build และ Playwright critical flows ผ่าน
- production dependency audit ไม่พบช่องโหว่ที่ทราบ และ peer dependency check ผ่าน
- vinext compatibility 100% และ Cloudflare Worker build/local runtime ผ่าน
- Worker ที่ไม่มี secret ตอบ health 503 และ redirect หน้าป้องกันไป login แบบ fail closed
- security headers, private signed download, shared rate limit, Origin check, immutable evidence/audit, human review, source snapshot และ transactional CSV import มี implementation แล้ว
- Passkey รองรับ enrollment, passwordless login, device revocation และ biometric step-up โดยเก็บเฉพาะ FIDO2 public key/counter ไม่เก็บภาพใบหน้าหรือลายนิ้วมือ
- Evidence intake รองรับ drag/drop หลายไฟล์และกล้องมือถือ; ไฟล์ `STORED/CLEAN` หรือ `STORED/NOT_SCANNED` ที่ผ่านการตรวจขนาด/MIME/magic bytes เปิด ส่งเข้า AI หรือใช้ในรายงานได้ ส่วน Vision OCR จำกัดไฟล์ไม่เกิน 20 MB และทุกผลยังคงเป็น `SUGGESTED` รอมนุษย์รับรอง
- Recon/Dossier ที่เคยใช้ข้อมูล fixture และสร้างข้อสรุปโดยไม่มี connector ทางการถูกปิดแบบ fail closed; Public Search ที่ไม่มี trusted-source match แสดง `UNREGISTERED`/confidence 0 และระบุว่าไม่ใช่ผลรับรอง

ยังห้ามใช้ข้อมูลจริงจนกว่า live gates ด้านล่างจะผ่านและมีผู้รับผิดชอบลงนาม

ระบบไม่ใช้ malware scanner ตาม product decision; readiness ตรวจเฉพาะบริการที่อยู่ในขอบเขตใช้งานจริง

## สิ่งที่เจ้าของโครงการต้องเตรียมเพื่อเริ่ม staging

เตรียม 4 เรื่องนี้ก่อน แล้วทีมเทคนิคจะเดิน live gates ต่อได้โดยไม่ต้องส่ง secret ผ่านแชต:

1. **Supabase:** สร้าง project สำหรับ staging แยกจาก production, ระบุผู้ดูแล DB และเปิดสิทธิ์ให้ผู้ทำ migration; นำ URL/key ไปใส่ใน secret manager ของ staging โดยตรง
2. **Cloudflare:** เตรียมบัญชี/zone, subdomain สำหรับ staging และผู้ที่มีสิทธิ์ deploy Worker กับตั้ง secret
3. **นโยบายข้อมูล:** ยืนยัน data residency, ระยะเก็บหลักฐานและ audit, ผู้อนุมัติสิทธิ์, backup/PITR และช่องทางแจ้งเหตุ
4. **บัญชีทดสอบ:** เตรียมผู้ใช้ทดสอบอย่างน้อย ADMIN, INVESTIGATOR สองคนที่เห็นคนละคดี, REVIEWER และ VIEWER

ห้ามส่ง `SUPABASE_SERVICE_ROLE_KEY`, partner key หรือ secret ใด ๆ ในแชต/อีเมล ให้ผู้มีสิทธิ์กรอกใน Supabase/Cloudflare secret manager หรือไฟล์ local ที่ไม่ถูก commit เท่านั้น

## Automation ที่เตรียมไว้แล้ว

- Supabase CLI และ local configuration: `pnpm exec supabase --version`
- ตรวจ migration ก่อน apply: `pnpm supabase:migrate:dry`
- ตรวจค่าระบบโดยไม่ยิง network: `pnpm staging:preflight`
- ตรวจ Supabase/health จริง: `pnpm staging:preflight:network`
- ตรวจแผนบัญชี 5 บทบาท: `pnpm staging:users:plan`
- ส่ง invitation และกำหนด role หลังแก้ `ops/staging-users.json`: `pnpm staging:users:apply`
- ทดสอบ Cloudflare deployment โดยไม่ deploy: `pnpm exec vinext-cloudflare deploy --env staging --dry-run`
- Deploy staging หลังผ่านทุก gate: `pnpm deploy:staging`

ไฟล์ตัวอย่างที่มี placeholder สามารถ commit ได้ แต่ `.env.staging.local` และ `ops/staging-users.json` ถูก ignore และห้ามนำขึ้น Git

## ค่าระบบที่ต้องเตรียม

| ค่า | ผู้รับผิดชอบ/แหล่งที่มา | หมายเหตุ |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project | เปิดเผยฝั่ง browser ได้ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project | เปิดเผยฝั่ง browserได้; RLS ต้องคุมสิทธิ์ |
| `SUPABASE_SERVICE_ROLE_KEY` | ผู้ดูแล secret | server-only; ห้ามใส่ Git/`NEXT_PUBLIC_*` |
| `PRIVATE_EVIDENCE_BUCKET` | ผู้ดูแล Supabase | ใช้ `evidence-vault`; ต้อง private |
| `APP_ORIGIN` | ทีมโดเมน | origin จริง เช่น `https://evidence.example.go.th` |
| `KOUPREY_SECRET_KEY` | เจ้าของ Kouprey | long random shared secret; วางแผน rotation |
| `PARTNER_API_KEYS` | เจ้าของ integrations | JSON map partner id → long random bearer key |

`KOUPREY_SECRET_KEY` และ `PARTNER_API_KEYS` เป็น optional ต่อ health หลัก แต่ endpoint นั้นจะตอบ 503 จนกว่าจะตั้งค่า

## Live Supabase gates

1. สร้าง Supabase project แยก dev/staging/production และเปิด backup/PITR ตามนโยบายองค์กร
2. Link CLI แล้ว apply migration ตามลำดับใน `supabase/migrations/` โดยต้องเก็บ output ของการ migrate
3. สร้าง Auth users และ `profiles` อย่างน้อย ADMIN, INVESTIGATOR A/B, REVIEWER และ VIEWER; มอบ case membership ต่างกัน
4. ยืนยัน bucket `evidence-vault` เป็น private และไม่มี public policy
5. รันทดสอบสิทธิ์ด้วย JWT ของแต่ละ role:
   - Investigator A อ่าน case B ไม่ได้
   - VIEWER/REVIEWER เขียน case/evidence/import ไม่ได้
   - direct insert evidence ถูกปฏิเสธ; member upload ผ่าน reserve/finalize RPC ได้
   - signed URL ออกได้เฉพาะ member และหลักฐานที่ `STORED` และผ่าน deterministic file validation; confirmed `INFECTED` ต้องถูกปฏิเสธ
   - audit update/delete และ stored evidence delete ถูกปฏิเสธ
   - suggestion จากหลักฐานที่ยังไม่พร้อมใช้งานยืนยันไม่ได้
   - ลงทะเบียน/ล็อกอิน/เพิกถอน Passkey ได้จริงบน Windows Hello, Face ID/Touch ID และ security key อย่างน้อยสองชนิด พร้อมตรวจ counter replay และ Audit Log
   - PERSON match ที่อาศัยชื่ออย่างเดียวถูกปฏิเสธ
   - report ที่ไม่มี source mention/reference ถูกปฏิเสธ
   - CSV import ที่ RPC ล้มเหลวไม่เหลือ partial batch/envelope
6. ตรวจ query/index/connection limits ด้วยข้อมูลขนาดใกล้ production

เครื่องที่ทำ audit ครั้งนี้มี Supabase CLI แต่ไม่มี Docker, linked staging project หรือ credentials จึงยังไม่ได้พิสูจน์ migration/RLS กับ PostgreSQL จริง จุดนี้เป็น release blocker

## File validation gate

ยืนยันว่า Supabase organization และ global upload limit รองรับไฟล์ 200 MB, bucket `evidence-vault` จำกัดไม่เกิน 200 MB และยังเป็น private จากนั้นทดสอบ TUS resume, ขนาด 0/เกิน 200 MB, extension/MIME/magic-byte mismatch, object หาย และไฟล์ 200 MB จริง

## Cloudflare gates

1. Login Cloudflare/Wrangler และสร้าง Worker environment แยก staging/production
2. ใส่ secret จากตารางด้านบนผ่าน secret manager ของ Cloudflare ห้ามใส่ใน `wrangler.jsonc`
3. รัน `pnpm build:vinext` แล้ว deploy staging ด้วย `pnpm deploy:vinext`
4. ตรวจ `/api/health` ต้องเป็น 200/`ready`; ตรวจ login, session refresh, logout, upload, signed download, CSV import, review, match และ report บน staging
5. เปิด WAF/rate limiting สำหรับ webhook paths, จำกัด request size, ผูก custom domain/TLS และตั้ง alert จาก 5xx/latency/security events
6. ทำ canary/rollback โดยเก็บ Worker version ก่อนหน้าและทดสอบ database migration backward compatibility

vinext ใช้ Workers Cache, ไม่ใช้ Data Cache/KV และไม่ใช้ Cloudflare Images เพื่อหลีกเลี่ยง cache ข้อมูลคดีและบริการที่ยังไม่จำเป็น

## External capability still requiring a decision

- Gemini text/Vision extraction เชื่อมผ่าน route ฝั่งเซิร์ฟเวอร์แล้ว: ถ้ามีข้อความจะวิเคราะห์ข้อความนั้น ถ้าเว้นว่างจะดาวน์โหลดต้นฉบับภาพ/PDF ที่พร้อมใช้งานจาก private bucket เพื่อทำ Vision OCR ตรวจผลด้วย schema และบันทึกเป็น `SUGGESTED`; งาน batch/background ใช้ automation job/n8n contract ที่มีอยู่ ส่วน demo ใช้ deterministic fixtureที่ติดป้ายชัดและไม่เรียก provider ภายนอก ยังต้องสรุป data residency, DPA, retention และ evaluation set ก่อนเปิด Gemini กับข้อมูลจริง
- Kouprey/Partner endpoints พร้อม contract แต่ต้องมี production key, partner test fixture และการซ้อม key rotation/replay response
- Email ingestion ไม่มี SMTP/mail provider เชื่อมจริง จึงยังไม่ควรประกาศช่องทางอีเมลว่าเปิดใช้งาน
- FDA SKYNET/Privus มี Recon Companion แบบ local auto-login แล้ว: credential เข้ารหัสด้วย Windows DPAPI, เริ่ม OIDC/PKCE ใหม่ทุกครั้ง และไม่ส่ง credential/session ขึ้น Cloudflare/Supabase; automated search/export หลังล็อกอินยังต้องมี adapter ที่ทดสอบกับบัญชีจริง
- HSS OSS มี local auto-login แบบต้องยืนยันความเสี่ยงทุกครั้ง แต่ยังไม่ผ่าน production transport gate เพราะ HTTPS path ย้อนกลับ HTTP; ต้องได้ HTTPS/API ที่ สบส. รับรองเพื่อยกเลิกข้อยกเว้น ดู `docs/EXTERNAL_SOURCE_INTEGRATION.md`

## Operational sign-off

ก่อน go-live ต้องมีหลักฐานอนุมัติจาก Product owner, Security/DPO, Supabase/DB owner, Cloudflare owner และ incident/backup owner พร้อมผล restore drill, retention policy, access review, log monitoring และคู่มือแจ้งเหตุ
