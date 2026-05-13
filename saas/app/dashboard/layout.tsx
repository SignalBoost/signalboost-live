// saas/app/dashboard/layout.tsx

import Link from "next/link";
import "../globals.css";

export const metadata = {
  title: "SignalBoost Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-black text-white flex flex-col p-6 space-y-6">
        <h2 className="text-2xl font-bold">SignalBoost</h2>

        <nav className="flex flex-col space-y-3">
          <Link
            href="/dashboard"
            className="hover:bg-gray-800 px-3 py-2 rounded-md transition"
          >
            Dashboard
          </Link>

          <Link
            href="/dashboard/generate"
            className="hover:bg-gray-800 px-3 py-2 rounded-md transition"
          >
            Generate
          </Link>

          <Link
            href="/dashboard/history"
            className="hover:bg-gray-800 px-3 py-2 rounded-md transition"
          >
            History
          </Link>

          <Link
            href="/dashboard/brand"
            className="hover:bg-gray-800 px-3 py-2 rounded-md transition"
          >
            Brand Settings
          </Link>

          <Link
            href="/dashboard/settings"
            className="hover:bg-gray-800 px-3 py-2 rounded-md transition"
          >
            Account Settings
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
