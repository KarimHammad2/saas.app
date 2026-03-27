/**
 * Extract inner HTML from a full document, or return the string as a fragment.
 */
export function extractBodyInner(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (match?.[1] ?? html).trim();
}

/**
 * Wrap email body in a single valid HTML document with UTF-8 and minimal inline styles.
 */
export function wrapEmailDocument(innerHtml: string): string {
  const safe = innerHtml.trim();
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "<style>",
    ".email-root{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;line-height:1.5;color:#111827;max-width:600px;margin:0;padding:24px 20px;}",
    ".email-root h1{font-size:1.5rem;margin:0 0 12px;font-weight:700;}",
    ".email-root h2{font-size:1.125rem;margin:24px 0 8px;font-weight:600;}",
    ".email-root p{margin:0 0 12px;}",
    ".email-root ul{margin:0 0 12px;padding-left:1.25rem;}",
    ".email-root .email-footer{color:#6b7280;font-size:13px;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;}",
    ".email-root hr.email-divider{border:none;border-top:1px solid #e5e7eb;margin:24px 0;}",
    "</style>",
    "</head>",
    '<body><div class="email-root">',
    safe,
    "</div></body>",
    "</html>",
  ].join("");
}
