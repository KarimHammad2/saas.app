function normalizeSpacing(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingFillers(value: string): string {
  let output = value.trim();
  const leadPattern =
    /^(?:(?:hey|hi|hello|so|yeah|yep|well|basically|actually|honestly|um|uh|hmm|i mean)\b[,\s-]*)+/i;
  while (leadPattern.test(output)) {
    output = output.replace(leadPattern, "").trim();
  }
  return output;
}

function stripSalutationAndFraming(value: string): string {
  let output = value.trim();
  output = output.replace(/^\s*(?:hi|hey|hello)\s+[a-z][a-z\s.'-]{0,40}[,!:]?\s*/i, "");
  output = output.replace(/^\s*this\s+is\s+(?:a|our)?\s*marketing\s+project[.\s-]*/i, "");
  return output.trim();
}

function normalizeSentence(value: string): string {
  const compact = normalizeSpacing(value)
    .replace(/\b(?:idk|i don't know)\b/gi, "")
    .replace(/\b(?:kinda|kind of|sort of|you know)\b/gi, "")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[.]{3,}/g, ".")
    .trim();
  return compact;
}

function humanizeIdea(rawIdea: string): string {
  const compact = normalizeSpacing(rawIdea)
    .replace(/^(?:a|an)\s+/i, "")
    .replace(/[.!,;:\s]+$/g, "");
  if (!compact) {
    return "";
  }

  if (/^saas\b/i.test(compact)) {
    const withoutSaas = compact.replace(/^saas\b[\s-]*/i, "").replace(/^for\b\s+/i, "").trim();
    if (!withoutSaas) {
      return "Potential SaaS platform.";
    }
    return `Potential SaaS platform for ${withoutSaas}.`;
  }

  return `Potential ${compact}.`;
}

function inferIdeaFromMessyInput(value: string): string | null {
  const compact = value.trim();
  const buildMatch = compact.match(
    /\b(?:i(?:'m| am)?\s*(?:thinking|planning|considering|want|want to|wanna|would like)\s*(?:to)?\s*)?(?:build|create|launch|start)\s+(.+)/i,
  );
  if (buildMatch?.[1]) {
    const humanized = humanizeIdea(buildMatch[1]);
    return humanized || null;
  }

  const looseIdeaMatch = compact.match(/\bsomething like\s+(?:a|an)?\s*(.+)/i);
  if (looseIdeaMatch?.[1]) {
    const humanized = humanizeIdea(looseIdeaMatch[1]);
    return humanized || null;
  }

  if (/^saas\b/i.test(compact)) {
    return humanizeIdea(compact);
  }

  return null;
}

function looksMessy(value: string): boolean {
  return /\b(?:idk|i don't know|kinda|kind of|sort of|you know|maybe)\b/i.test(value) || /^hey\b/i.test(value.trim());
}

function finalizeSentence(value: string): string {
  const compact = normalizeSpacing(value).replace(/[.!,;:\s]+$/g, "");
  if (!compact) {
    return "";
  }
  const capitalized = compact[0] ? `${compact[0].toUpperCase()}${compact.slice(1)}` : compact;
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function cleanOverviewText(input: string): string {
  const normalized = normalizeSpacing(input);
  if (!normalized) {
    return "";
  }

  const withoutFraming = stripSalutationAndFraming(normalized);
  const withoutFillers = stripLeadingFillers(withoutFraming || normalized);
  const sentence = normalizeSentence(withoutFillers || normalized);
  if (!sentence) {
    return "";
  }

  if (!looksMessy(sentence)) {
    return normalizeSpacing(sentence);
  }

  const inferredIdea = inferIdeaFromMessyInput(sentence);
  if (inferredIdea) {
    return finalizeSentence(inferredIdea);
  }

  return normalizeSpacing(sentence);
}
