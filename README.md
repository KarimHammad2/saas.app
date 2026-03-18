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

Provider-specific signature validation is enforced through the selected provider module.

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
