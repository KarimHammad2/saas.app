/**
 * Rule-based intent classifier for inbound emails arriving without a project code or thread reference.
 *
 * Goal: avoid creating garbage projects when a user sends a greeting, a one-liner,
 * or any message that does not clearly describe a new project.
 *
 * Confidence scale 0–1:
 *   ≥ 0.6  → treat as new-project intent → create project
 *   < 0.6  → insufficient signal → send clarification reply
 */

export interface IntentClassification {
  isNewProjectIntent: boolean;
  /** 0–1 confidence score. */
  confidence: number;
  reason: string;
}

/** Phrases that are definitely NOT project requests. */
const VAGUE_EXACT_PATTERNS: RegExp[] = [
  /^(hi+|hey+|hello+|howdy|greetings|good\s+(?:morning|afternoon|evening)|what'?s\s+up|sup|yo)\b[\s.!?]*$/i,
  /^(ok|okay|ok+|thanks|thank\s+you|thx|ty|noted|got\s+it|sounds\s+good|perfect|great|cool|sure|yep|nope|yes|no|bye|goodbye|ttyl|lol|haha|😊|👍|🙏)[\s.!?]*$/i,
  /^(test|testing|test\s+email|email\s+test)[\s.!?]*$/i,
  /^(checking\s+in|just\s+checking|follow[\s-]?up|following\s+up|touching\s+base|pinging\s+you)[\s.!?]*$/i,
  /^(can\s+you\s+hear\s+me|is\s+this\s+working|did\s+you\s+get\s+this)[\s.!?]*$/i,
];

/** Positive signals that strongly suggest new project intent. */
const PROJECT_INTENT_PATTERNS: RegExp[] = [
  /\bi\s+(?:want|need|would\s+like|am\s+looking)\s+to\s+(?:build|create|develop|make|design|start|launch|work\s+on)\b/i,
  /\b(?:new\s+project|project\s+idea|my\s+(?:next\s+)?(?:project|idea)|startup\s+idea)\b/i,
  /\b(?:idea\s*:|project\s*:)\b/i,
  /\b(?:building|developing|creating|designing|launching|starting)\s+(?:a|an|the|our|my)\b/i,
  /\bworking\s+on\s+(?:a|an|the|our|my)\b/i,
  /\b(?:help\s+(?:me|us)\s+(?:with|build|create|develop|design|plan|structure))\b/i,
  /\bneed\s+(?:someone\s+to\s+help|help\s+(?:with|us|me)|to\s+(?:build|create|develop|design|plan))\b/i,
  /\b(?:saas|mvp|app\s+idea|web\s+app|mobile\s+app|platform|marketplace|tool\s+(?:for|that)|system\s+for|software\s+for|api\s+for)\b/i,
  /\b(?:i\s+have\s+an?\s+idea|here'?s?\s+(?:the\s+)?(?:project|idea|plan|concept))\b/i,
  /\b(?:roadmap|sprint|backlog|feature\s+list|user\s+story|milestone)\b/i,
];

const WORD_COUNT_STRONG_SIGNAL = 30;
const WORD_COUNT_WEAK_SIGNAL = 10;
const CONFIDENCE_THRESHOLD = 0.6;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function classifyInboundIntent(subject: string, rawBody: string): IntentClassification {
  const body = rawBody.trim();
  const subjectClean = subject.replace(/^re:\s*/i, "").trim();
  const wordCount = countWords(body);

  // Extremely short — cannot be a project description.
  if (wordCount < 4) {
    return { isNewProjectIntent: false, confidence: 0.05, reason: "message too short (fewer than 4 words)" };
  }

  // Match known vague / greeting-only bodies.
  for (const pattern of VAGUE_EXACT_PATTERNS) {
    if (pattern.test(body)) {
      return { isNewProjectIntent: false, confidence: 0.1, reason: "matches known vague/greeting pattern" };
    }
  }

  // Count positive project-intent signals across subject + body.
  let positiveHits = 0;
  for (const pattern of PROJECT_INTENT_PATTERNS) {
    if (pattern.test(body) || pattern.test(subjectClean)) {
      positiveHits += 1;
    }
  }

  // Each matching pattern contributes 0.25 (four matches → 1.0).
  let confidence = Math.min(0.9, positiveHits * 0.25);

  // Long, substantive body is itself a signal even without keyword matches.
  if (wordCount >= WORD_COUNT_STRONG_SIGNAL) {
    confidence = Math.min(1, confidence + 0.35);
  } else if (wordCount >= WORD_COUNT_WEAK_SIGNAL) {
    confidence = Math.min(1, confidence + 0.15);
  }

  const isNewProjectIntent = confidence >= CONFIDENCE_THRESHOLD;

  return {
    isNewProjectIntent,
    confidence,
    reason: isNewProjectIntent ? "sufficient project-intent signals detected" : "insufficient project-intent signals",
  };
}
