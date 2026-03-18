export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-100">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-10 shadow-2xl">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-400">SaaS²</p>
        <h1 className="mb-5 text-4xl font-semibold leading-tight sm:text-5xl">
          Email-native project memory for Frank, your AI project manager.
        </h1>
        <p className="max-w-2xl text-lg text-zinc-300">
          SaaS² keeps project continuity through structured email loops. No dashboards, no plugins, and no direct LLM
          integration required.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Orchestration</h2>
            <p className="text-sm text-zinc-400">`saas2.app` receives, parses, and routes inbound project emails.</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Memory</h2>
            <p className="text-sm text-zinc-400">`saas2.io` stores project context, profile context, and transactions.</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Human Oversight</h2>
            <p className="text-sm text-zinc-400">RPM workflows and explicit approvals preserve trust and auditability.</p>
          </article>
        </div>

        <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
          <p className="text-sm text-zinc-300">MVP inbound endpoint:</p>
          <code className="mt-2 block text-sm text-zinc-100">POST /api/inbound</code>
        </div>
      </section>
    </main>
  );
}
