# SaaS² Orchestration Layer (Full MVP)

This repository implements the SaaS² email-native loop:

`User -> Frank -> Email -> saas2.app -> memory contracts -> Supabase -> outbound state email`

## What Is Included

- Inbound webhook route: `POST /api/inbound`
- Provider abstraction (`Resend`, `SES stub`)
- Deterministic email parsing into canonical normalized events
- Memory contract layer aligned to saas2.io-style functions
- Domain modules for:
  - RBAC
  - pricing tier transitions
  - 90/10 transaction logic
  - kickoff automation
  - RPM suggestion approvals
- Outbound state email containing:
  - Summary
  - Goals
  - Action Items
  - Decisions
  - Risks
  - Recommendations
  - pending RPM suggestions
  - remainder balance
  - transaction history

## Stack

- Next.js App Router
- Supabase/Postgres
- Resend for email provider integration
- Vitest for tests

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# provider selection: resend | ses
EMAIL_PROVIDER=resend

# shared
MASTER_USER_EMAIL=daniel@saas2.app

# resend
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
RESEND_FROM_EMAIL="Frank <frank@domain.com>"

```

## Local Development

```bash
npm install
npm run dev
```

## Database Setup

Apply Supabase migrations, including:

- `20260318_000001_create_mvp_schema.sql`
- `20260318_000002_harden_set_updated_at_search_path.sql`
- `20260318_000003_grant_service_role_privileges.sql`
- `20260318_000004_expand_full_mvp_schema.sql`

## Testing

```bash
npm run test
npm run lint
```

## Webhook Payload Support

`/api/inbound` accepts:

- `application/json`
- `application/x-www-form-urlencoded`
- `multipart/form-data`

Resend webhook signatures are verified using `svix-*` headers and `RESEND_WEBHOOK_SECRET`.
SES remains a future provider stub and is not used for MVP outbound delivery.

### Resend Webhook Secret Setup (Vercel)

If `/api/inbound` responds with `CONFIGURATION_ERROR`, the server is missing a valid `RESEND_WEBHOOK_SECRET`.

1. In Resend, open your inbound webhook and copy the **Signing secret** (must start with `whsec_`).
2. In Vercel, open your project settings and add `RESEND_WEBHOOK_SECRET` for the environments you deploy to.
3. Redeploy, then re-send a webhook event to confirm `/api/inbound` succeeds.

## MVP Scope Traceability

- **Inbound email handling (plaintext + HTML + forwarding/signature strip + section detection):**
  - `modules/email/parseInbound.ts`
  - `modules/email/providers/normalizeInboundPayload.ts`
- **Email provider abstraction (`sendEmail`, `parseInbound`, `validateSignature`):**
  - `modules/email/providers/types.ts`
  - `modules/email/providers/resendProvider.ts`
  - `modules/email/providers/sesProvider.ts`
- **Orchestration boundary (no UI, no direct DB logic in route):**
  - `app/api/inbound/route.ts`
  - `modules/orchestration/processInboundEmail.ts`
- **Memory-layer contract behavior (`storeSummary`, `appendActionItems`, `updateGoals`, profile/suggestion/transaction stores, `getProjectState`):**
  - `modules/memory/repository.ts`
- **Domain modules (RBAC, pricing, financial logic, kickoff automation):**
  - `modules/domain/rbac.ts`
  - `modules/domain/pricing.ts`
  - `modules/domain/financial.ts`
  - `modules/domain/kickoff.ts`
- **RPM workflow (pending suggestions + approval):**
  - `modules/orchestration/processInboundEmail.ts`
  - `modules/memory/repository.ts`
- **Outbound project-state email (state + approvals + suggestions + transaction history):**
  - `modules/output/sendProjectEmail.ts`
  - `modules/output/formatProjectEmail.ts`
  - `modules/output/generateProjectDocument.ts`
- **Persistence schema and idempotency support:**
  - `supabase/migrations/20260318_000001_create_mvp_schema.sql`
  - `supabase/migrations/20260318_000004_expand_full_mvp_schema.sql`

## Manual Acceptance Checks

1. **Kickoff**
   - Send first email from a new sender.
   - Confirm user + profile + project are created.
2. **Project Context Update**
   - Send labeled sections (`Summary`, `Goals`, `Action Items`, etc.).
   - Confirm project state is updated and outbound email reflects it.
3. **RPM Suggestion**
   - Send `UserProfile Suggestion:` block from RPM sender.
   - Confirm suggestion is stored as pending and appears in outbound email.
4. **Suggestion Approval**
   - User sends `Approve suggestion <id>`.
   - Confirm suggestion status updates and profile context changes are applied.
5. **Transaction Flow**
   - Send a `Transaction:` block.
   - Confirm tier transition, financial normalization, transaction storage, and remainder balance update.
