# External investigation source integration

Verified 2026-08-27. This document records only public entry-point behavior and LawiRisk-SSK controls. It contains no external credentials, query results, citizen identifiers, or live OAuth state/nonce values.

## FDA SKYNET / Privus

- Authority: สำนักงานคณะกรรมการอาหารและยา กระทรวงสาธารณสุข
- Public entry point: `https://privus.fda.moph.go.th/`
- Observed authentication: eGov Connect / OpenID Connect with PKCE-style callback parameters
- LawiRisk-SSK mode: `LOCAL_AUTO_LOGIN`

Recon Companion บนเครื่อง Windows เปิด stable Privus state endpoint สำหรับ `เจ้าหน้าที่ สสจ.` (`STATE=3`) เพื่อสร้าง Digital ID/OIDC transaction ใหม่ แล้วกรอก username/password จาก Windows DPAPI และกดเข้าสู่ระบบอัตโนมัติ โปรแกรมไม่บันทึกหรือ replay callback URL ยาว เพราะ state, nonce และ code challenge ใช้ได้กับ authentication session เดียว หากมี OTP/QR/MFA/CAPTCHA จะหยุดรอเจ้าหน้าที่ ข้อมูล credential/session ไม่ถูกส่งเข้า LAW-i-RISK, Cloudflare หรือ Supabase และ official PDF/image export พร้อม source reference/capture time ยังต้องถูกนำเข้าคลังหลักฐานก่อนยืนยันข้อเท็จจริง

## HSS OSS

- Authority: กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข
- Supplied entry point: `http://oss.hss.moph.go.th/auth/login`
- Observed transport: requesting the HTTPS path redirects back to HTTP
- LawiRisk-SSK mode: `LOCAL_AUTO_LOGIN_RISK_ACK_REQUIRED`

Recon Companion สามารถกรอกและส่งแบบฟอร์มบนเครื่องเจ้าหน้าที่ได้ แต่ต้องยืนยันความเสี่ยงใน LAW-i-RISK ทุกครั้ง เพราะ credential ถูกส่งผ่าน HTTP โดยไม่มี TLS รหัสที่เก็บด้วย DPAPI ไม่ถูกส่งขึ้นระบบกลาง ข้อยกเว้นนี้ไม่ทำให้ HSS ผ่าน production security gate; ช่องทางที่แนะนำยังเป็น HTTPS endpoint/API ที่หน่วยงานรับรอง พร้อมสิทธิ์, audit, retention, fixture และกระบวนการ revoke/rotation

## Manual evidence capture invariant

1. Search only under the officer's authorized purpose and source account.
2. Export the smallest official result needed, preserving the record reference and capture timestamp.
3. Import the file through Evidence Intake to validate type/magic bytes/size, compute SHA-256, and store it privately.
4. Treat derived values as suggestions until an authorized human reviews the exact source mention.
5. Never copy an external password, access token, OAuth code, citizen identifier, or raw result into chat, application logs, URL query strings, or Git.

## Automatic search connector acceptance

Auto-login ใช้งานผ่าน local companion ได้แล้ว แต่ automation หลังล็อกอินยังต้องตรวจหน้าค้นจริงตามสิทธิ์ของบัญชีและเพิ่ม adapter แยกแหล่ง โดย contract ต้องกำหนด allowed queries, purpose/role scope, rate limits, fields, pagination, source version, immutable response snapshot, error/retry, retention, incident contact, credential rotation และ non-production test environment
