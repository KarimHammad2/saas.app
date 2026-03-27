import { getCronSecret, getReminderIdleDays } from "@/lib/env";
import { log } from "@/lib/log";
import { buildReminderEmailPayload } from "@/modules/email/templates/projectEmailTemplates";
import { MemoryRepository } from "@/modules/memory/repository";
import { sendProjectEmail } from "@/modules/output/sendProjectEmail";

export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  try {
    const expected = `Bearer ${getCronSecret()}`;
    return auth === expected;
  } catch {
    return false;
  }
}

async function runReminders(): Promise<{ sent: number; candidates: number }> {
  const repo = new MemoryRepository();
  const idleDays = getReminderIdleDays();
  const candidates = await repo.listProjectsForReminder(idleDays);
  let sent = 0;
  for (const c of candidates) {
    let reservationTimestamp: string | null = null;
    try {
      reservationTimestamp = await repo.reserveReminderSlot(c.projectId, idleDays);
      if (!reservationTimestamp) {
        continue;
      }
      const state = await repo.getProjectState(c.projectId);
      const pending = await repo.getPendingSuggestions(c.userId);
      const payload = buildReminderEmailPayload(state, pending);
      await sendProjectEmail([c.userEmail], payload);
      sent += 1;
    } catch (e) {
      if (reservationTimestamp) {
        try {
          await repo.releaseReminderSlot(c.projectId, reservationTimestamp);
        } catch (releaseError) {
          log.error("reminder release failed", { projectId: c.projectId, error: String(releaseError) });
        }
      }
      log.error("reminder send failed", { projectId: c.projectId, error: String(e) });
    }
  }
  return { sent, candidates: candidates.length };
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runReminders();
  return Response.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runReminders();
  return Response.json({ ok: true, ...result });
}
