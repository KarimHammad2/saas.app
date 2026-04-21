export interface KickoffSeedMatch {
  seed: string | null;
  sourcePhrase: string | null;
  /** Paragraph that produced the winning seed; null when falling back to whole-body match. */
  sourceParagraph: string | null;
}

const KICKOFF_SECTION_BOUNDARY =
  /(?:\n\s*\n|(?:^|\n)\s*(?:Goals|Tasks|Completed|Decisions|Risks|Notes|Project Name|Current Status)\s*:)/i;

const GREETING_LINE = /^\s*(?:hi|hey|hello|dear|good\s+(?:morning|afternoon|evening))\s+[a-z][a-z\s.'-]{0,40}[,!:]?\s*$/i;

const CLOSING_LINE_PATTERNS: RegExp[] = [
  /^\s*(?:thanks|thank\s+you|thx|many\s+thanks|cheers)[.,!?\s-]*$/i,
  /^\s*(?:regards|best(?:\s+regards)?|kind\s+regards|warm(?:est)?\s+regards|sincerely|yours(?:\s+truly)?|warmly|talk\s+soon)[.,!?\s-]*$/i,
  /^\s*looking\s+forward(?:\s+to\s+[a-z ]{1,60})?[.,!?\s-]*$/i,
  /^\s*let\s+me\s+know(?:\s+[a-z ]{1,80})?[.,!?\s-]*$/i,
  /^\s*speak\s+soon[.,!?\s-]*$/i,
  /^\s*sent\s+from\s+my\s+\w+.*$/i,
  /^\s*--\s*$/,
];

const URL_OR_PHONE_ONLY_LINE = /^\s*(?:https?:\/\/\S+|www\.\S+|\+?\d[\d\s().-]{6,})\s*$/i;

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
      /\b(?:i|we)\s+(?:want|need|would\s+like|(?:['\u2019]?d)\s+like)\s+to\s+(?:build|create|develop|plan|make)\s+([\s\S]+)/i,
  },
];

const TOPIC_KEYWORDS = [
  "saas",
  "app",
  "application",
  "platform",
  "product",
  "website",
  "web",
  "portal",
  "campaign",
  "dashboard",
  "crm",
  "tool",
  "service",
  "system",
  "marketplace",
  "mvp",
  "api",
  "software",
  "pipeline",
  "funnel",
  "ecommerce",
  "e-commerce",
  "store",
  "shop",
  "analytics",
  "automation",
  "integration",
  "newsletter",
  "blog",
  "community",
  "course",
  "coaching",
  "marketing",
  "outreach",
  "lead",
  "leads",
  "brand",
  "agency",
  "restaurant",
  "restaurants",
  "booking",
  "reservation",
];

const VERB_PARTICLE_PREFIX = /^(?:out|up|over|into|through|around)\s+/i;
const CLAUSE_BOUNDARY =
  /\s+(?:because|since|so\s+that|so\s+we|so\s+i|and\s+we(?:['\u2019]?re|\s+are)|and\s+i(?:['\u2019]?m|\s+am)|but\s+|however\s+)/i;
const EM_DASH_BOUNDARY = /\s+[—–-]\s+/;

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

function trimAtClauseBoundaries(value: string): string {
  let out = value;
  const clauseMatch = out.match(CLAUSE_BOUNDARY);
  if (clauseMatch && typeof clauseMatch.index === "number" && clauseMatch.index > 0) {
    out = out.slice(0, clauseMatch.index).trimEnd();
  }
  const dashMatch = out.match(EM_DASH_BOUNDARY);
  if (dashMatch && typeof dashMatch.index === "number" && dashMatch.index > 0) {
    out = out.slice(0, dashMatch.index).trimEnd();
  }
  return out;
}

function stripLeadingParticles(value: string): string {
  let out = value;
  while (VERB_PARTICLE_PREFIX.test(out)) {
    out = out.replace(VERB_PARTICLE_PREFIX, "");
  }
  return out;
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
  const firstPass = (sentenceMatch?.[1] ?? normalized)
    .replace(/[.!,;:\s]+$/g, "")
    .trim();

  const clauseTrimmed = trimAtClauseBoundaries(firstPass).trim();
  const candidate = stripLeadingParticles(clauseTrimmed || firstPass)
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

function isGreetingLine(line: string): boolean {
  return GREETING_LINE.test(line);
}

function isClosingLine(line: string): boolean {
  return CLOSING_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function isUrlOrPhoneLine(line: string): boolean {
  return URL_OR_PHONE_ONLY_LINE.test(line);
}

function isTrivialParagraph(paragraph: string): boolean {
  const lines = paragraph
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return true;
  }
  return lines.every(
    (line) => isGreetingLine(line) || isClosingLine(line) || isUrlOrPhoneLine(line),
  );
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function countTopicHits(seedLower: string): number {
  let hits = 0;
  for (const keyword of TOPIC_KEYWORDS) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(seedLower)) {
      hits += 1;
    }
  }
  return hits;
}

function scoreSeedCandidate(seed: string, keptIndex: number, totalKept: number): number {
  const words = seed.split(/\s+/).filter(Boolean);
  const wc = words.length;
  let score = 0;

  if (wc >= 3 && wc <= 12) {
    score += 3;
  } else if (wc === 2 || (wc >= 13 && wc <= 15)) {
    score += 1;
  } else if (wc > 15) {
    score -= 2;
  } else {
    score -= 3;
  }

  score += Math.min(countTopicHits(seed.toLowerCase()) * 2, 6);

  const longAlphaWords = words.filter((word) => /^[a-z][a-z0-9'-]{3,}$/i.test(word)).length;
  score += Math.floor(longAlphaWords / 3);

  if (totalKept > 1 && keptIndex > 0) {
    score += 1;
  }

  if (VERB_PARTICLE_PREFIX.test(seed)) {
    score -= 3;
  }

  return score;
}

interface ScoredCandidate {
  seed: string;
  sourcePhrase: string;
  paragraph: string;
  score: number;
  keptIndex: number;
}

function collectCandidatesForParagraph(
  paragraph: string,
  keptIndex: number,
  totalKept: number,
): ScoredCandidate[] {
  const deGreeted = stripGreetingLines(paragraph) || paragraph;
  const focusedText = removeGenericDeclarations(deGreeted) || deGreeted;
  const candidates: ScoredCandidate[] = [];

  for (const { sourcePhrase, pattern } of KICKOFF_SEED_PATTERNS) {
    const match = focusedText.match(pattern);
    const seed = cleanSeed(match?.[1] ?? "");
    if (!seed) {
      continue;
    }
    candidates.push({
      seed,
      sourcePhrase,
      paragraph,
      keptIndex,
      score: scoreSeedCandidate(seed, keptIndex, totalKept),
    });
  }

  return candidates;
}

export function extractKickoffSeed(text: string): KickoffSeedMatch {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { seed: null, sourcePhrase: null, sourceParagraph: null };
  }

  const paragraphs = splitIntoParagraphs(normalized);
  const kept = paragraphs.filter((paragraph) => !isTrivialParagraph(paragraph));

  const candidates: ScoredCandidate[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    candidates.push(...collectCandidatesForParagraph(kept[i], i, kept.length));
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.keptIndex - b.keptIndex;
    });
    const best = candidates[0];
    return {
      seed: best.seed,
      sourcePhrase: best.sourcePhrase,
      sourceParagraph: best.paragraph,
    };
  }

  // Fallback: first-match-wins across the whole de-greeted body for backward compatibility.
  const deGreeted = stripGreetingLines(normalized);
  const focusedText = removeGenericDeclarations(deGreeted || normalized) || deGreeted || normalized;
  for (const { sourcePhrase, pattern } of KICKOFF_SEED_PATTERNS) {
    const match = focusedText.match(pattern);
    const seed = cleanSeed(match?.[1] ?? "");
    if (seed) {
      return { seed, sourcePhrase, sourceParagraph: null };
    }
  }

  return { seed: null, sourcePhrase: null, sourceParagraph: null };
}
