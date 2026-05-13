import "./globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen bg-gray-100 text-gray-900">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900 text-gray-100 flex flex-col p-6">
          <h1 className="text-2xl font-bold mb-8 text-yellow-400">SignalBoost</h1>
          <nav className="flex flex-col space-y-4">
            <Link href="/dashboard" className="hover:text-yellow-400">Dashboard</Link>
            <Link href="/projects" className="hover:text-yellow-400">Projects</Link>
            <Link href="/history" className="hover:text-yellow-400">History</Link>
            <Link href="/settings" className="hover:text-yellow-400">Settings</Link>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-10 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
