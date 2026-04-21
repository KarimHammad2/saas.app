import type { ProjectFollowUp } from "@/modules/contracts/types";

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(base: Date, days: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

function parseBaseDate(baseTimestamp: string): Date {
  const parsed = new Date(baseTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function parseExplicitDateOnly(value: string): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoMatch?.[1]) {
    return isoMatch[1];
  }
  return null;
}

function resolveWeekdayDate(value: string, base: Date): string | null {
  const trimmed = normalizeText(value).toLowerCase();
  const weekdayMatch = trimmed.match(/^(next\s+)?(sun|mon|tue|wed|thu|fri|sat)(?:day)?\b/);
  if (!weekdayMatch?.[2]) {
    return null;
  }

  const weekdayName =
    weekdayMatch[2] === "sun"
      ? "sunday"
      : weekdayMatch[2] === "mon"
        ? "monday"
        : weekdayMatch[2] === "tue"
          ? "tuesday"
          : weekdayMatch[2] === "wed"
            ? "wednesday"
            : weekdayMatch[2] === "thu"
              ? "thursday"
              : weekdayMatch[2] === "fri"
                ? "friday"
                : "saturday";
  const targetDay = WEEKDAY_INDEX[weekdayName];
  const baseDay = base.getUTCDay();
  let delta = (targetDay - baseDay + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  if (weekdayMatch[1]) {
    delta += 7;
  }
  return toDateOnlyIso(addDaysUtc(base, delta));
}

export function resolveFollowUpDueDate(whenText: string, baseTimestamp: string): string | null {
  const normalized = normalizeText(whenText);
  if (!normalized) {
    return null;
  }

  const explicit = parseExplicitDateOnly(normalized);
  if (explicit) {
    return explicit;
  }

  const base = parseBaseDate(baseTimestamp);
  const lower = normalized.toLowerCase();
  if (lower === "today") {
    return toDateOnlyIso(addDaysUtc(base, 0));
  }
  if (lower === "tomorrow") {
    return toDateOnlyIso(addDaysUtc(base, 1));
  }
  if (lower === "day after tomorrow") {
    return toDateOnlyIso(addDaysUtc(base, 2));
  }

  const weekday = resolveWeekdayDate(normalized, base);
  if (weekday) {
    return weekday;
  }

  return null;
}

export function normalizeFollowUpKey(input: Pick<ProjectFollowUp, "action" | "target" | "whenText" | "dueDate">): string {
  return [input.action, input.target, input.dueDate ?? input.whenText]
    .map((part) => normalizeText(part).toLowerCase())
    .join("|");
}

export function formatFollowUpDisplayLine(followUp: Pick<ProjectFollowUp, "action" | "target" | "whenText" | "dueDate">): string {
  const action = normalizeText(followUp.action);
  const target = normalizeText(followUp.target);
  const whenText = normalizeText(followUp.whenText);
  const dateLabel = followUp.dueDate?.trim() || whenText || "(none)";
  const metadata = [target ? `Target: ${target}` : null, whenText ? `When: ${whenText}` : null].filter(Boolean).join(", ");

  if (!metadata) {
    return `- [${dateLabel}] ${action}`;
  }

  return `- [${dateLabel}] ${action} (${metadata})`;
}
