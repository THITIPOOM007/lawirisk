# Current Architecture

## 1. Application Layer
- **Framework:** Next.js 16.3 (App Router)
- **Runtime:** Cloudflare Workers via Vinext
- **UI:** Tailwind CSS v4, custom Cyberpunk/Forensic HUD design system.
- **Client State:** React Context/External stores (`useSyncExternalStore` for offline mock auth).

## 2. Database & Storage Layer (Supabase)
- **RDBMS:** PostgreSQL 17 with 18 tables and 28 stored procedures (RPCs).
- **Security:** Extensive Row-Level Security (RLS) policies. Almost all mutations go through `SECURITY DEFINER` RPCs rather than direct `INSERT/UPDATE`.
- **Storage:** Private buckets (`evidence-vault`, `intake-vault`). Signed URLs used for access.

## 3. Automation Layer
- **External Workflow:** n8n Webhooks.
- **AI Extraction:** Google Gemini 2.5 Flash via REST API (strictly server-side).

## 4. Dual-Mode Architecture
- **Production Mode:** Hits Supabase for all state.
- **Demo Mode:** Uses `demo-data.ts` (in-memory/localStorage mock) when Supabase env variables are missing or `DEMO_MODE=true`. Allows local UI testing without a database.
