export function buildProjectUpdateEmailText(summary: string, document: string): string {
  return [`Project Update`, ``, summary, ``, `Attached latest project memory document.`, ``, document].join("\n");
}

export function buildProjectUpdateEmailHtml(summary: string, document: string): string {
  const safeSummary = summary.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const safeDocument = document.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  return [
    "<!doctype html>",
    "<html><body>",
    "<h2>Project Update</h2>",
    `<p>${safeSummary}</p>`,
    "<p>Attached latest project memory document.</p>",
    `<pre>${safeDocument}</pre>`,
    "</body></html>",
  ].join("\n");
}
