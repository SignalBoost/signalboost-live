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
          <header className="flex justify-between items-center bg-white shadow px-6 py-4 mb-6 rounded-lg">
            <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
            <div className="flex items-center space-x-6">
              <span className="text-sm font-semibold text-yellow-600">Credits: 50</span>
              <span className="text-sm text-gray-600">user@example.com</span>
            </div>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
