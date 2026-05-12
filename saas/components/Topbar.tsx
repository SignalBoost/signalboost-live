export default function Topbar() {
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 bg-[#05070b] px-6 py-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Dashboard</h2>
        <p className="text-xs text-neutral-500">
          Manage your SignalBoost workspace
        </p>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/"
          className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-900"
        >
          View Site
        </a>

        <a
          href="/billing"
          className="rounded-lg bg-[#FFD700] px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-400"
        >
          Upgrade
        </a>
      </div>
    </header>
  );
}
