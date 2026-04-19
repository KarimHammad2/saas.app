export interface KickoffSeedMatch {
  seed: string | null;
  sourcePhrase: string | null;
}

const KICKOFF_SECTION_BOUNDARY =
  /(?:\n\s*\n|(?:^|\n)\s*(?:Goals|Tasks|Completed|Decisions|Risks|Notes|Project Name|Current Status)\s*:)/i;

const GREETING_LINE = /^\s*(?:hi|hey|hello)\s+[a-z][a-z\s.'-]{0,40}[,!:]?\s*$/i;

const GENERIC_DECLARATIONS: RegExp[] = [
  /^\s*this\s+is\s+a?\s*marketing\s+project\s*$/i,
  /^\s*this\s+is\s+our?\s+marketing\s+project\s*$/i,
  /^\s*marketing\s+project\s*$/i,
];

const KICKOFF_SEED_PATTERNS: Array<{ sourcePhrase: string; pattern: RegExp }> = [
  {
    sourcePhrase: "project_goal",
    pattern: /(?:^|\n)\s*project\s+goal\s*:\s*([^\n]+)/i,
  },
  {
    sourcePhrase: "launch_campaign",
    pattern:
      /\b(?:i|we)\s+(?:want|need|plan|would\s+like|(?:['\u2019]?d)\s+like)\s+to\s+(?:launch|run|start)\s+([\s\S]+)/i,
  },
  {
    sourcePhrase: "campaign_statement",
    pattern:
      /\b(?:launch|run|start)\s+(?:a|an|the|our|new)?\s*(?:outbound|marketing|lead[-\s]?generation|lead\s+gen)?\s*campaign\b[\s:,-]*([\s\S]+)/i,
  },
  {
    sourcePhrase: "working_on",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+working(?:\s+\w+){0,4}\s+on\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "building",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+building\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "planning",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+planning\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "creating",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+creating\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "developing",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+developing\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "launching",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+launching\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "starting",
    pattern:
      /\b(?:here(?:['\u2019]?s| is)\s+what\s+)?(?:i|we)(?:['\u2019]?m|\s+am|['\u2019]?re|\s+are)\s+starting\s*[:\-]?\s*([\s\S]+)/i,
  },
  {
    sourcePhrase: "want_to_build",
    pattern:
      /\bi\s+(?:want|need|would\s+like|(?:['\u2019]?d)\s+like)\s+to\s+(?:build|create|develop|launch|start|plan)\s+([\s\S]+)/i,
  },
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripGreetingLines(value: string): string {
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const trimmed: string[] = [];
  let skippedGreeting = false;

  for (const line of lines) {
    const l = line.trim();
    if (!skippedGreeting && (l === "" || GREETING_LINE.test(l))) {
      if (GREETING_LINE.test(l)) {
        skippedGreeting = true;
      }
      continue;
    }
    trimmed.push(line);
  }

  return trimmed.join("\n").trim();
}

function removeGenericDeclarations(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !GENERIC_DECLARATIONS.some((pattern) => pattern.test(line)))
    .join(" ");
}

function trimAtSectionBoundary(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const match = normalized.match(KICKOFF_SECTION_BOUNDARY);
  if (!match || match.index == null) {
    return normalized;
  }
  return normalized.slice(0, match.index).trimEnd();
}

function cleanSeed(raw: string): string | null {
  const withoutSections = trimAtSectionBoundary(raw);
  const normalized = normalizeWhitespace(
    withoutSections
      .replace(/^[a-z][a-z\s.'-]{0,40},\s*/i, "")
      .replace(/^\s*[:\-–—]+\s*/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.)]\s+/, ""),
  );

  if (!normalized) {
    return null;
  }

  const sentenceMatch = normalized.match(/^(.{1,240}?[.!?])(?:\s|$)/);
  const candidate = (sentenceMatch?.[1] ?? normalized)
    .replace(/[.!,;:\s]+$/g, "")
    .trim();

  const generic = candidate.toLowerCase();
  if (
    generic === "a project" ||
    generic === "the project" ||
    generic === "project" ||
    generic === "new project"
  ) {
    return null;
  }

  return candidate || null;
}

export function extractKickoffSeed(text: string): KickoffSeedMatch {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { seed: null, sourcePhrase: null };
  }
  const deGreeted = stripGreetingLines(normalized);
  const focusedText = removeGenericDeclarations(deGreeted || normalized) || deGreeted || normalized;

  for (const { sourcePhrase, pattern } of KICKOFF_SEED_PATTERNS) {
    const match = focusedText.match(pattern);
    const seed = cleanSeed(match?.[1] ?? "");
    if (seed) {
      return { seed, sourcePhrase };
    }
  }

  return { seed: null, sourcePhrase: null };
}
