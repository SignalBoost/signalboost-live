"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import CreditUsage from "@/components/CreditUsage";
import { supabase } from "@/lib/supabaseClient";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/history", label: "History" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <aside className="hidden h-screen w-72 shrink-0 flex-col justify-between border-r border-white/10 bg-black/40 p-5 md:flex">
      <div>
        <div className="mb-8">
          <p className="text-2xl font-black tracking-tight text-white">
            SignalBoost
          </p>
          <p className="mt-1 text-xs font-bold text-yellow-400">
            AI Content Engine
          </p>
        </div>

        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  active
                    ? "bg-yellow-400 text-black"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        <CreditUsage usedCredits={12} totalCredits={50} />

        <button
          onClick={handleLogout}
          className="w-full rounded-full border border-red-500/30 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
