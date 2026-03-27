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

- Inbound webhook: `POST /api/inbound`
- Email provider abstraction (Resend, SES stub)
- Deterministic parsing into normalized events
- Memory contract layer aligned to saas2.io-style functions
- Domain modules: RBAC, pricing tier transitions, 90/10 transaction logic, kickoff automation, RPM suggestion approvals
- Outbound state email: overview, goals, tasks, risks, notes

### Stack

- Next.js App Router  
- Supabase/Postgres  
- Resend for email  
- Vitest for tests  

### Environment variables

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

### MVP scope traceability

| Area | Primary locations |
|------|-------------------|
| Inbound parsing | `modules/email/parseInbound.ts`, `modules/email/providers/normalizeInboundPayload.ts` |
| Providers | `modules/email/providers/types.ts`, `resendProvider.ts`, `sesProvider.ts` |
| Orchestration | `app/api/inbound/route.ts`, `modules/orchestration/processInboundEmail.ts` |
| Memory contracts | `modules/memory/repository.ts` |
| Domain (RBAC, pricing, financial, kickoff) | `modules/domain/*.ts` |
| RPM / suggestions | `processInboundEmail.ts`, `repository.ts` |
| Outbound email | `modules/output/sendProjectEmail.ts`, `formatProjectEmail.ts`, `generateProjectDocument.ts` |
| Schema | `supabase/migrations/` |

### Manual acceptance checks

1. **Kickoff** — First email from a new sender creates user, profile, and project.  
2. **Project update** — Labeled sections (`Summary`, `Goals`, `Action Items`, etc.) update state and outbound email.  
3. **RPM suggestion** — `UserProfile Suggestion:` from RPM is stored as pending and appears outbound.  
4. **Approval** — User sends `Approve suggestion <id>`; profile updates apply.  
5. **Transaction** — `Transaction:` block updates tier, financial normalization, storage, and remainder balance.

---

*SaaS² — continuity for serious projects, without another dashboard to manage.*
