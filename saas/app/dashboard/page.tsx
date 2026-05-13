export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#070a0f] p-6 text-white">
      <section className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-bold text-yellow-400">SignalBoost AI</p>
          <h1 className="mt-2 text-4xl font-black">Dashboard</h1>
          <p className="mt-2 text-gray-400">
            Create content, track credits, and manage your AI workspace.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#111722] p-6">
            <p className="text-sm text-gray-400">Credits Used</p>
            <p className="mt-2 text-3xl font-black text-yellow-400">0</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111722] p-6">
            <p className="text-sm text-gray-400">Plan</p>
            <p className="mt-2 text-3xl font-black">Starter</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111722] p-6">
            <p className="text-sm text-gray-400">Status</p>
            <p className="mt-2 text-3xl font-black text-green-400">Ready</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111722] p-6">
          <h2 className="text-2xl font-black text-yellow-400">
            Create Content
          </h2>

          <textarea
            className="mt-4 h-36 w-full rounded-2xl border border-white/10 bg-gray-950 p-4 text-white outline-none focus:border-yellow-400"
            placeholder="Describe what you want to create..."
          />

          <button className="mt-4 rounded-full bg-yellow-400 px-6 py-3 font-black text-black hover:bg-yellow-300">
            Generate
          </button>
        </div>
      </section>
    </main>
  );
}
