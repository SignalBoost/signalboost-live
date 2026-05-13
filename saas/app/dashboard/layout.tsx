// saas/app/dashboard/layout.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "History", href: "/history" },
    { name: "Settings", href: "/settings" },
    { name: "Logout", href: "/logout" },
  ];

  return (
    <div style={container}>
      {/* Mobile Top Bar */}
      <div style={mobileTopBar}>
        <button onClick={() => setOpen(!open)} style={hamburger}>
          ☰
        </button>
        <h2 style={mobileLogo}>SignalBoost</h2>
      </div>

      {/* Sidebar */}
      <aside
        style={{
          ...sidebar,
          ...(open ? sidebarOpen : sidebarClosed),
        }}
      >
        <h2 style={logo}>SignalBoost</h2>

        <nav style={nav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
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

/* Layout Styles */

const container = {
  display: "flex",
  minHeight: "100vh",
  background: "#05070b",
  color: "white",
};

/* Desktop Sidebar */
const sidebar = {
  width: "240px",
  background: "#0b111a",
  padding: "30px 20px",
  borderRight: "1px solid #222",
  display: "flex",
  flexDirection: "column" as const,
  gap: "20px",
  transition: "transform 0.3s ease",
};

/* Mobile Sidebar States */
const sidebarClosed = {
  transform: "translateX(-260px)",
};

const sidebarOpen = {
  transform: "translateX(0)",
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

/* Main Content */
const main = {
  flex: 1,
  padding: "40px",
};

/* Mobile Top Bar */
const mobileTopBar = {
  display: "none",
  padding: "16px",
  background: "#0b111a",
  borderBottom: "1px solid #222",
  alignItems: "center",
  gap: "12px",
};

/* Hamburger Button */
const hamburger = {
  fontSize: "26px",
  background: "transparent",
  border: "none",
  color: "white",
  cursor: "pointer",
};

const mobileLogo = {
  fontSize: "22px",
  fontWeight: "bold",
  color: "#FFD700",
};

/* Responsive Rules */
if (typeof window !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width: 900px) {
      aside {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        z-index: 999;
      }
      main {
        padding: 20px !important;
      }
      div[style*="mobileTopBar"] {
        display: flex !important;
      }
    }
  `;
  document.head.appendChild(style);
}
