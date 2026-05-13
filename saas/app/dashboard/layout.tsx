// saas/app/dashboard/layout.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "History", href: "/history" },
    { name: "Settings", href: "/settings" },
    { name: "Logout", href: "/logout" },
  ];

  return (
    <div style={container}>
      {/* Sidebar */}
      <aside style={sidebar}>
        <h2 style={logo}>SignalBoost</h2>

        <nav style={nav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...navItem,
                background: pathname === item.href ? "#FFD700" : "transparent",
                color: pathname === item.href ? "#000" : "#fff",
              }}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={main}>{children}</main>
    </div>
  );
}

const container = {
  display: "flex",
  minHeight: "100vh",
  background: "#05070b",
  color: "white",
};

const sidebar = {
  width: "240px",
  background: "#0b111a",
  padding: "30px 20px",
  borderRight: "1px solid #222",
  display: "flex",
  flexDirection: "column" as const,
  gap: "20px",
};

const logo = {
  fontSize: "26px",
  fontWeight: "bold",
  color: "#FFD700",
};

const nav = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "12px",
};

const navItem = {
  padding: "12px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  textDecoration: "none",
  border: "1px solid #333",
};

const main = {
  flex: 1,
  padding: "40px",
};
