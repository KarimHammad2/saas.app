/**
 * Keep only the new reply content: drop quoted lines, common thread headers, and signatures.
 */
export function stripQuotedReply(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^on .+wrote:\s*$/i.test(trimmed)) {
      break;
    }
    if (/^Am .+ schrieb .+:$/i.test(trimmed)) {
      break;
    }
    if (/^Le .+ a écrit\s*:/i.test(trimmed)) {
      break;
    }
    if (/^-----Original Message-----$/i.test(trimmed)) {
      break;
    }
    if (/^_{20,}$/.test(trimmed)) {
      break;
    }
    if (trimmed.startsWith(">")) {
      continue;
    }
    if (/^--\s*$/.test(trimmed)) {
      break;
    }
    result.push(line);
  }

  return result.join("\n");
}
