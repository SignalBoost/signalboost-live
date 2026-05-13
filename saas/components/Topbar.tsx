"use client";

export default function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-white/10 bg-black/20 px-6">
      <div>
        <p className="text-sm font-bold text-white">Workspace</p>
      </div>

      <div className="flex items-center gap-3">
        <select className="rounded-full border border-white/10 bg-gray-900 px-3 py-2 text-sm text-white">
          <option>EN</option>
          <option>ES</option>
          <option>PT</option>
        </select>

        <div className="grid h-9 w-9 place-items-center rounded-full bg-yellow-400 font-black text-black">
          S
        </div>
      </div>
    </header>
  );
}
