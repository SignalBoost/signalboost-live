export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-yellow-400">SignalBoost AI</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-400">
          Welcome back. Create content, track credits, and review your history.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-5">
          <p className="text-sm text-gray-400">Content Generated</p>
          <p className="mt-2 text-3xl font-bold text-white">0</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-5">
          <p className="text-sm text-gray-400">Active Plan</p>
          <p className="mt-2 text-3xl font-bold text-yellow-400">Starter</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-5">
          <p className="text-sm text-gray-400">Status</p>
          <p className="mt-2 text-3xl font-bold text-green-400">Ready</p>
        </div>
      </div>
    </div>
  );
}
