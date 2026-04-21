# SaaS²

**Email-native project memory for Frank, your AI project manager.**

---

## What is SaaS²?

SaaS² (read “SaaS squared”) is built for people who want their projects to stay organized **without living inside another app**. You keep working the way you already do—mostly in email—and the system remembers what matters: goals, tasks, risks, notes, and the story of your project over time.

There are no dashboards to learn, no browser plugins to install, and no requirement to wire artificial intelligence directly into this product. The loop is simple: **you and Frank communicate by email; SaaS² receives those messages, updates a durable project memory, and sends you back a clear snapshot of where things stand.**

---

## The problem it solves

Projects drift when updates are scattered across threads, tools, and chats. Important context gets buried in forwards and signatures. When someone asks “where are we?” it takes detective work.

SaaS² is designed to **reduce that friction** by treating email as the main channel: structured updates flow in, the system **parses and routes** them responsibly, and you get **consistent, readable summaries** so continuity survives from one week to the next.

---

## How it works (in plain English)

1. **You send email** related to your project—often routed through Frank (for example, messages to Frank’s address).
2. **The orchestration layer** receives the message, understands plain text and typical email formats, and turns it into a normalized update.
3. **Project memory** stores your context: overview, goals, tasks, risks, notes, profile-related suggestions, and (when applicable) billing or tier-related activity—so nothing important depends on a single thread.
4. **You get email back** that reflects the current state: what’s agreed, what’s pending, and what to do next—including areas where a human must explicitly approve a change.

That’s the loop: **email in → memory updated → clear state email out.**

---

## Three ideas at the center

### Orchestration

Inbound project email is **received, parsed, and routed** so the right kind of update is applied. The system is built to handle real-world email—not only perfect templates—including forwarded content and common clutter, so your updates still land in the right place.

### Memory

Your project isn’t just a pile of messages. SaaS² maintains **structured memory**: project context, profile context where relevant, and a record of transactions when your workflow includes pricing or plan changes. The goal is **one place that “knows” the project** even when the conversation is long.

### Human oversight

Not every change should happen silently. **RPM-style workflows** (responsible party workflows) and **explicit approvals** mean suggestions and sensitive updates can sit in a **pending** state until the right person agrees. That supports **trust and auditability**: you can see what was proposed, what was approved, and what the system recorded.

---

## Meeting Frank

**Frank** is your AI project manager in this story—the persona that helps you run the project by email. SaaS² doesn’t replace Frank; it **powers the continuity behind the scenes**: when mail arrives, memory updates, and state is echoed back to you in a dependable format.

You might ask Frank for help, send updates, or follow the prompts you receive after kickoff. The product is tuned so **email stays the interface** you’re already comfortable with.

---

## Your first message and what happens next

When someone new reaches the system, **kickoff** logic creates the right records and frames the conversation: a concise summary, goals where you’ve provided them, and **suggested follow-up questions**—for example about timeline, budget range, and who the work is for—so the project doesn’t start in a vacuum.

You aren’t forced to use a form; you can **reply in natural language** and structured sections when you want the system to pick up specific blocks (like goals or action items) reliably.

---

## What you see in project state email

Outbound messages aim to give you a **single readable picture**, typically including:

- **Overview** — the current narrative of the project  
- **Goals** — what you’re trying to achieve  
- **Tasks** — concrete next steps and commitments  
- **Risks** — what could go wrong or needs attention  
- **Notes** — supporting detail and context  

Depending on your workflow, the same channel can also surface **pending suggestions** (awaiting approval) and **recent transaction or tier-related history** when that applies to your account.

The attached **`project-document.md`** (when enabled) is the full structured artifact for LLM use: it can include **follow-ups**, **escalation** guidance, task lists, and account context—see **`PROJECT_DOCUMENT_MODE`** (`minimal` vs `full`) in the developer section.

---

## Approvals and roles

Some updates—especially those that affect your **profile** or **money-related** records—are designed so **only the right actor** can approve them. The primary account owner, designated partners (such as an RPM contact), and administrative roles are **distinguished** so proposals and approvals stay clear and defensible.

---

## Why email-native?

- **Familiar:** Almost everyone already lives in email for important threads.  
- **Portable:** You’re not locked into a proprietary chat or a heavy desktop client.  
- **Quiet:** No extra “project hub” to check unless you want one; the state comes back to you.  
- **Honest about AI:** The product doesn’t pretend you must plug a large language model in here; Frank can live wherever your AI workflow already is.

---

## For developers

This repository implements the **SaaS² orchestration layer** for the full MVP email loop:

`User → Frank → Email → saas2.app → memory contracts → database → outbound state email`

### What’s included

**HTTP API**

- `POST /api/inbound` — Resend (or SES) webhook: verify signature, normalize payload, enqueue processing  
- `POST /api/cron/inbound` — Worker: drain inbound queue, run orchestration, send project replies (Bearer `CRON_SECRET`)  
- `GET` / `POST /api/cron/reminders` — Idle-project reminder sender (Bearer `CRON_SECRET`)  

**Email & orchestration**

- Provider abstraction: **Resend** (primary) and **SES** (inbound verification supported)  
- Multipart / JSON / form-encoded webhook bodies; Resend **Svix** signature verification  
- Async inbound queue with idempotency, retries, and bounce/failed event handling  
- Rule-based **new-project intent** classifier: low-confidence first messages get a clarification reply instead of a junk project  
- Deterministic parsing: project code in subject, labeled sections (`Goals`, `Tasks`, `Completed`, `Risks`, `Notes`, `Summary` / `Overview`, corrections, transactions, etc.)  
- **Kickoff** automation with seed extraction; optional **CC membership confirmation** before project creation  
- **Multi-project** support; RBAC for owner, RPM, participants, and master user  
- **RPM profile suggestions** (pending approval), **tier transitions**, **90/10 transaction** recording, payment-link flow and **“Paid”** confirmation replies  
- **Scope / pivot detection**, **task completion** detection and task-intent handling  
- **Escalation** blocks (`Escalation:` + Type RPM | Review | Approval) with logging and notifications  
- **Follow-up** tracking (`FollowUp:` action / target / when) with natural-language date resolution  
- **Admin** email command flow: pending actions, confirmations, tier/RPM/archive/template/system-setting edits, with **audit log**  
- Outbound: minimal body + **`project-document.md`** attachment (configurable **minimal** vs **full** document); optional **admin BCC** on outbound  

**Data & ops**

- Supabase **Postgres** schema + **RLS**; **pg_cron** + **pg_net** invoke app webhooks for inbound processing and reminders  

### Stack

| Layer | Choice |
|--------|--------|
| Framework | **Next.js** 16 (App Router), **React** 19 |
| Language | **TypeScript** 5 |
| Styling | **Tailwind CSS** 4 (minimal marketing page in `app/page.tsx`) |
| Database | **Supabase** / **PostgreSQL** |
| Email | **Resend** (API + inbound webhooks); SES inbound path supported |
| Tests / lint | **Vitest** 4, **ESLint** 9 (`eslint-config-next`) |

### Environment variables

**Required (typical Resend deployment)**

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Bearer secret for GET/POST /api/cron/* — must match Supabase system_settings for pg_cron jobs
CRON_SECRET=

# Resend API (outbound) + inbound webhook signing secret (whsec_… from Resend)
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
RESEND_FROM_EMAIL="Frank <frank@your-verified-domain.com>"
```

**Inbound policy (not env-configurable)**

The Frank inbox used in the **To** check is **hard-coded** to `frank@saas2.app` in [`lib/env.ts`](lib/env.ts) (`getInboundTriggerEmail`). Your Resend **inbound route** must receive mail for that address (or you change the code to match your domain). CC/Bcc alone do not satisfy policy.

**Email provider**

```bash
# resend (default) | ses
EMAIL_PROVIDER=resend

# Optional second provider if you implement fallback sending
# EMAIL_PROVIDER_FALLBACK=

# Required when using SES for verified inbound webhooks
# SES_WEBHOOK_SECRET=
```

**Identity & filtering**

```bash
# “Daniel” / master user — defaults if unset
MASTER_USER_EMAIL=daniel@saassquared.com

# Extra From addresses treated as internal for inbound (comma-separated)
# INTERNAL_INBOUND_SENDERS=
```

**Product tuning**

```bash
# Days without inbound before a project is eligible for idle reminders (default 7)
# REMINDER_IDLE_DAYS=

# project-document.md: minimal | full
# PROJECT_DOCUMENT_MODE=minimal

# Overview: frozen (kickoff-only) | rules-based regeneration
# OVERVIEW_REGENERATION_MODE=frozen

# Allow inbound Summary:/Overview: to replace stored overview (default off)
# ALLOW_OVERVIEW_OVERRIDE=false

# Copy outbound project mail to an admin BCC (set both)
# ENABLE_ADMIN_BCC=false
# ADMIN_BCC_EMAIL=
```

### Local development

```bash
npm install
npm run dev
```

### Database

Apply Supabase migrations under `supabase/migrations/` (including initial schema and subsequent phases).

### Testing

```bash
npm run test
npm run lint
```

### Webhook payload support

`/api/inbound` accepts `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data`. Resend webhook signatures are verified with `svix-*` headers and `RESEND_WEBHOOK_SECRET`.

#### Resend webhook secret (e.g. Vercel)

If `/api/inbound` returns `CONFIGURATION_ERROR`, set `RESEND_WEBHOOK_SECRET` from Resend’s inbound webhook **Signing secret** (`whsec_…`), redeploy, and retest.

### Troubleshooting: “success” in Resend/Vercel but no email

Resend **webhook delivery success** and Vercel **HTTP 200** on `/api/inbound` only mean the notification reached your app. They do **not** guarantee that the message was accepted for processing or that a **reply** was sent.

#### 1. Verify whether the inbound was ignored (policy)

When the app skips a message by policy, the route still returns **200** with a JSON body like:

```json
{
  "ok": true,
  "ignored": true,
  "reason": "not_addressed_to_frank",
  "provider": "resend",
  "eventId": "...",
  "requestId": "..."
}
```

**How to check:** Inspect that response (Resend’s webhook event detail often shows the response body), or in Vercel logs look for `inbound email skipped by policy` and the **`reason`** field in the structured log.

| `reason` | Meaning | What to change |
|----------|---------|----------------|
| `not_addressed_to_frank` | The address `frank@saas2.app` is not in **`To`**. CC/Bcc alone do not count. | Put **`frank@saas2.app` in To** (or change `getInboundTriggerEmail()` in code and your Resend inbound route to match). |
| `internal_sender` | The normalized **From** matches the trigger address (`frank@saas2.app`), a built-in alias (`message@`, `contact@`, `system@` on that domain), or **`INTERNAL_INBOUND_SENDERS`**. | Send from a normal external mailbox when testing the full loop. (The **master user** address is *not* on this blocklist so RPM-style replies from that address still work.) |
| `invalid_sender` | The From address could not be normalized to a valid email. | Fix the client’s From header. |

Implementation: [`modules/email/inboundPolicy.ts`](modules/email/inboundPolicy.ts), [`app/api/inbound/route.ts`](app/api/inbound/route.ts).

#### 2. Replies are sent asynchronously (after policy passes)

Accepted mail is **queued** in Supabase; the **project reply** is sent when the **inbound worker** runs (`POST /api/cron/inbound`), triggered by **pg_cron** in Supabase (not inside the `/api/inbound` request).

**Configure the worker once** in the Supabase SQL editor (same DB as your migrations), using your deployed app URL and the **same** secret as **`CRON_SECRET`** in Vercel:

```sql
select public.configure_inbound_webhook(
  'https://YOUR_PROJECT.vercel.app/api/cron/inbound',
  'YOUR_CRON_SECRET_MATCHING_VERCEL'
);
```

Requirements:

- Migrations that define `configure_inbound_webhook`, `invoke_inbound_webhook`, and the `inbound_worker_every_minute` job are applied.
- `cron.inbound.webhook_url` and `cron.inbound.secret` in `system_settings` must be non-empty (the function above sets them).

**How to verify:** After a non-ignored inbound, watch Vercel for **`POST /api/cron/inbound`** with **200**, not only `/api/inbound`. If the worker never runs or returns **401**, align the bearer token with `CRON_SECRET`.

#### 2b. Reminders cron (idle projects)

Project **idle reminders** are sent by **`/api/cron/reminders`**, scheduled separately from the inbound worker. Configure it in Supabase (same **`CRON_SECRET`** as Vercel) after migrations that define `configure_reminders_webhook`:

```sql
select public.configure_reminders_webhook(
  'https://YOUR_PROJECT.vercel.app/api/cron/reminders',
  'YOUR_CRON_SECRET_MATCHING_VERCEL'
);
```

Eligibility window is controlled by **`REMINDER_IDLE_DAYS`** (default **7**).

#### 3. Outbound sends via Resend API (different from inbound webhooks)

If the problem is **sending** mail through the Resend API (dashboard “sent”, API 200) while the **recipient inbox** stays empty, that is **not** the `email.received` webhook path. Check domain verification and DNS for your sending domain, the **from** address, the recipient’s spam folder, and Resend **delivery / bounce** events (e.g. delivered, bounced), not only webhook success to Vercel.

### MVP scope traceability

| Area | Primary locations |
|------|-------------------|
| Inbound parsing | `modules/email/parseInbound.ts`, `modules/email/providers/normalizeInboundPayload.ts` |
| Providers | `modules/email/providers/types.ts`, `resendProvider.ts`, `sesProvider.ts` |
| Inbound policy | `modules/email/inboundPolicy.ts`, `lib/env.ts` (`getInboundTriggerEmail`) |
| New-project intent / clarification | `modules/orchestration/classifyInboundIntent.ts`, `sendClarificationEmail.ts` |
| Orchestration | `app/api/inbound/route.ts`, `modules/orchestration/processInboundEmail.ts`, `handleInboundEmail.ts` |
| Memory contracts | `modules/memory/repository.ts` |
| Domain (RBAC, pricing, financial, kickoff, scope, completion) | `modules/domain/*.ts` |
| RPM / suggestions | `modules/domain/rpmSuggestions.ts`, `processInboundEmail.ts` |
| CC kickoff confirmation | `modules/domain/ccMembershipDecision.ts`, `processInboundEmail.ts` |
| Escalations | `modules/orchestration/escalations.ts` |
| Follow-ups | `modules/domain/followUps.ts` |
| Admin email actions | `modules/orchestration/adminConversation.ts`, `adminActionsExecutor.ts` |
| Outbound email | `modules/output/sendProjectEmail.ts`, `formatProjectEmail.ts`, `generateProjectDocument.ts` |
| Idle reminders cron | `app/api/cron/reminders/route.ts`, `supabase/migrations/*_cron_reminders.sql` |
| Schema | `supabase/migrations/` |

### Manual acceptance checks

1. **Kickoff** — First email from a new sender creates user, profile, and project.  
2. **Project update** — Labeled sections (`Summary`, `Goals`, `Action Items`, etc.) update state and outbound email.  
3. **RPM suggestion** — `UserProfile Suggestion:` from RPM is stored as pending and appears outbound.  
4. **Approval** — User sends `Approve suggestion <id>`; profile updates apply.  
5. **Transaction owner path** — Owner email with `Transaction:` block stores transaction + remainder atomically.  
6. **Transaction protected path** — Non-owner sensitive transaction proposal stays pending until owner approval.  
7. **Webhook idempotency** — Replay same inbound provider event id; verify second request is `duplicate=true` and no extra outbound email.  
8. **Retry storm safety** — Simulate worker transient failures, confirm retries then terminal fallback once at max attempts.  
9. **Bounce/failed monitoring** — Send provider failure event (`email.bounced` / `email.failed`) and verify it is logged/audited without queueing inbound work.  
10. **Attachment validation** — Ensure outbound `project-document.md` includes required sections; malformed document generation should fail fast.  
11. **Escalation** — Inbound body includes valid `Escalation:` / `Type:` / `Reason:`; verify logging and optional notification.  
12. **Follow-up** — `FollowUp:` block stored and reflected in project document / state as designed.  
13. **Idle reminder** — After `REMINDER_IDLE_DAYS` without inbound, `configure_reminders_webhook` fires `/api/cron/reminders` and a reminder sends once per reservation rules.  
14. **Admin action** — Authorized admin email proposes an action; confirmation flow executes and writes `admin_audit_log` where applicable.

---

*SaaS² — continuity for serious projects, without another dashboard to manage.*
