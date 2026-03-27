export function buildProjectUpdateEmailText(summary: string, document: string): string {
  return [summary, ``, `Your project has been updated.`, ``, `Attached is the latest project memory document.`, ``, document].join("\n");
}

export function buildProjectUpdateEmailHtml(summary: string, document: string): string {
  const safeSummary = summary.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const safeDocument = document.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  return [
    "<!doctype html>",
    "<html><body>",
    `<p>${safeSummary}</p>`,
    "<p>Your project has been updated.</p>",
    "<p>Attached is the latest project memory document.</p>",
    `<pre>${safeDocument}</pre>`,
    "</body></html>",
  ].join("\n");
}
