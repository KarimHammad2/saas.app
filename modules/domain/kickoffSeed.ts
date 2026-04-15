export interface KickoffSeedMatch {
  seed: string | null;
  sourcePhrase: string | null;
}

const KICKOFF_SECTION_BOUNDARY =
  /(?:\n\s*\n|(?:^|\n)\s*(?:Goals|Tasks|Completed|Decisions|Risks|Notes|Project Name|Current Status)\s*:)/i;

const KICKOFF_SEED_PATTERNS: Array<{ sourcePhrase: string; pattern: RegExp }> = [
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

  return candidate || null;
}

export function extractKickoffSeed(text: string): KickoffSeedMatch {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { seed: null, sourcePhrase: null };
  }

  for (const { sourcePhrase, pattern } of KICKOFF_SEED_PATTERNS) {
    const match = normalized.match(pattern);
    const seed = cleanSeed(match?.[1] ?? "");
    if (seed) {
      return { seed, sourcePhrase };
    }
  }

  return { seed: null, sourcePhrase: null };
}
