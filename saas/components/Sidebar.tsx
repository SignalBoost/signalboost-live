const items = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Projects", href: "/projects" },
  { label: "Website Generator", href: "/website-generator" },
  { label: "Graphics", href: "/graphics" },
  { label: "Voice Ads", href: "/voice" },
  { label: "Automations", href: "/automations" },
  { label: "Billing", href: "/billing" },
  { label: "Settings", href: "/settings" }
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 min-h-screen flex-col border-r border-neutral-800 bg-black p-6">
      <h1 className="mb-8 text-xl font-bold text-[#FFD700]">
        SignalBoost
      </h1>

      <nav className="space-y-2">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-[#FFD700]"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
