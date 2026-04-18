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
  isGreetingOnly: boolean;
  /** 0–1 confidence score. */
  confidence: number;
  reason: string;
}

/** Phrases that are definitely NOT project requests. */
const VAGUE_EXACT_PATTERNS: RegExp[] = [
  /^(hi+|hey+|hello+|howdy|greetings|good\s+(?:morning|afternoon|evening)|what'?s\s+up|sup|yo)\b[\s.!?]*$/i,
  /^(ok|okay|ok+|thanks|thank\s+you|thx|ty|noted|got\s+it|sounds\s+good|perfect|great|cool|sure|yep|nope|yes|no|bye|goodbye|ttyl|lol|haha|😊|👍|🙏)[\s.!?]*$/i,
  /^(yes|yeah|yep|sure|ok(?:ay)?)(?:\s+do\s+it)?(?:\s+please)?[\s.!?]*$/i,
  /^(test|testing|test\s+email|email\s+test)[\s.!?]*$/i,
  /^(asdf|qwerty|zxcv|asdfgh|qwertyuiop)[\s.!?]*$/i,
  /^(checking\s+in|just\s+checking|follow[\s-]?up|following\s+up|touching\s+base|pinging\s+you)[\s.!?]*$/i,
  /^(can\s+you\s+hear\s+me|is\s+this\s+working|did\s+you\s+get\s+this)[\s.!?]*$/i,
];

/**
 * Unambiguous first-person declarations of intent to build — always treat as new project.
 * Runs after vague checks so greetings/noise cannot match.
 */
const STRONG_OVERRIDE_PATTERNS: RegExp[] = [
  /\b(?:start|create|begin|initialize)\s+(?:a|the|new)\s+project\b/i,
  /\b(?:start|create|begin|initialize)\s+project\b/i,
  /\bkick\s+off\s+(?:a|the|new)\s+project\b/i,
  /\bkick\s+off\s+project\b/i,
  /\bnew\s+project\b/i,
  /\bi\s+(?:want|would\s+like|(?:['\u2019]?d)\s+like|need)\s+to\s+(?:build|create|make|develop|design|launch|start|plan|setup|set\s+up|automate|organize|manage|track|run|promote|grow)\b/i,
  /\bi\s+need\s+help\s+with\b/i,
  /\b(?:build|create|develop|design|launch|plan|setup|set\s+up|automate|organize|manage|track)\s+(?:a|an|the|my|our|new)\s+(?:app|website|platform|system|dashboard|tool|saas|software|product|startup|business|automation|crm|api|project)\b/i,
  /\b(?:build|create|develop|design|launch|plan|setup|set\s+up|automate|organize|manage|track)\s+(?:app|website|platform|system|dashboard|tool|saas|software|product|startup|business|automation|crm|api|project)\b/i,
  /\bi(?:['\u2019]?m|\s+am)\s+(?:starting|planning|building|creating|developing|launching|making|working(?:\s+\w+){0,4}\s+on)\b/i,
  /\bwe(?:'?re|\s+are)\s+(?:building|creating|developing|launching|working(?:\s+\w+){0,4}\s+on)\b/i,
];

/** Positive signals that strongly suggest new project intent. */
const PROJECT_INTENT_PATTERNS: RegExp[] = [
  /\bi\s+(?:want|need|would\s+like|(?:['\u2019]?d)\s+like|am\s+looking)\s+to\s+(?:build|create|develop|make|design|start|launch|plan|setup|set\s+up|automate|organize|manage|track|work\s+on)\b/i,
  /\b(?:new\s+project|project\s+idea|my\s+(?:next\s+)?(?:project|idea)|startup\s+idea)\b/i,
  /\b(?:idea\s*:|project\s*:)\b/i,
  /\b(?:building|developing|creating|designing|launching|starting)\s+(?:a|an|the|our|my)\b/i,
  /\bworking(?:\s+\w+){0,4}\s+on\s+([a-z0-9][\w-]*)(?:\s+[a-z0-9][\w-]*){0,8}\b/i,
  /\b(?:help\s+(?:me|us)\s+(?:with|build|create|develop|design|plan|structure))\b/i,
  /\bneed\s+(?:someone\s+to\s+help|help\s+(?:with|us|me)|to\s+(?:build|create|develop|design|plan))\b/i,
  /\b(?:app|website|platform|system|dashboard|tool|saas|software|product|startup|business|automation|crm|api|ai\s+tool)\b/i,
  /\b(?:saas|mvp|app\s+idea|web\s+app|mobile\s+app|platform|marketplace|tool\s+(?:for|that)|system\s+for|software\s+for|api\s+for)\b/i,
  /\b(?:workflow\s+automation|automation\s+tool|automation\s+workflow|orchestration|like\s+(?:n8n|zapier|make(?:\.com)?|integromat))\b/i,
  /\b(?:build|create|develop|design|launch|plan|setup|set\s+up|automate|organize|manage|track)\s+(?:a|an|the|my|our|new)?\s*(?:app|website|platform|system|dashboard|tool|saas|software|product|startup|business|automation|crm|api|project)\b/i,
  /\b(?:i\s+have\s+an?\s+idea|here'?s?\s+(?:the\s+)?(?:project|idea|plan|concept))\b/i,
  /\b(?:roadmap|sprint|backlog|feature\s+list|user\s+story|milestone)\b/i,
  // Paid marketing / GTM (often no "build an app" phrasing).
  /\b(?:google|meta|facebook|linkedin|tiktok|microsoft)\s+ads?\b/i,
  /\b(?:paid\s+search|ppc\b|sem\b|display\s+ads?|retargeting|remarketing|lead\s+gen|demand\s+gen|marketing\s+campaign)\b/i,
  /\b(?:get|generate|attract|drive)\s+(?:more\s+)?(?:new\s+)?leads\b/i,
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
    return {
      isNewProjectIntent: false,
      isGreetingOnly: true,
      confidence: 0.05,
      reason: "message too short (fewer than 4 words)",
    };
  }

  // Match known vague / greeting-only bodies.
  for (const pattern of VAGUE_EXACT_PATTERNS) {
    if (pattern.test(body)) {
      return {
        isNewProjectIntent: false,
        isGreetingOnly: true,
        confidence: 0.1,
        reason: "matches known vague/greeting pattern",
      };
    }
  }

  for (const pattern of STRONG_OVERRIDE_PATTERNS) {
    if (pattern.test(body)) {
      return {
        isNewProjectIntent: true,
        isGreetingOnly: false,
        confidence: 0.9,
        reason: "strong-override: explicit build/create intent",
      };
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
    isGreetingOnly: false,
    confidence,
    reason: isNewProjectIntent ? "sufficient project-intent signals detected" : "insufficient project-intent signals",
  };
}
