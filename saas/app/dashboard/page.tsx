import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardCard from "@/components/DashboardCard";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-[#05070b]">
      <Sidebar />

      <main className="flex-1">
        <Topbar />

        <div className="p-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-[#FFD700]">
              Welcome Back
            </h1>

            <p className="mt-2 text-neutral-400">
              Manage your AI marketing workspace.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <DashboardCard
              title="Projects"
              value="12"
              description="Active AI projects"
            />

            <DashboardCard
              title="Automations"
              value="5"
              description="Running workflows"
            />

            <DashboardCard
              title="Generated Content"
              value="24"
              description="Graphics, websites & voice ads"
            />
          </div>

          <div className="mt-10 rounded-2xl border border-neutral-800 bg-black p-6">
            <h2 className="text-xl font-semibold text-white">
              Recent Activity
            </h2>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-sm text-white">
                  Website generated successfully
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  2 minutes ago
                </p>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-sm text-white">
                  Voice advertisement created
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  15 minutes ago
                </p>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-sm text-white">
                  New automation enabled
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  1 hour ago
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
