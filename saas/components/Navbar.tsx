import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="glass border-b border-white/[0.06] px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="14" r="2" fill="#ffc300"/>
          <path d="M4 10.5 Q9 4 14 10.5" stroke="#ffc300" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
          <path d="M1.5 7 Q9 -1 16.5 7" stroke="rgba(255,195,0,0.35)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        </svg>
        <span className="font-bold text-base tracking-tight">
          signal<span className="text-gold">boost</span>
        </span>
      </div>

      <div className="flex items-center gap-6">
        <Link href="/" className="text-sm text-white/40 hover:text-white transition-colors">Home</Link>
        <Link href="/dashboard" className="text-sm text-white/40 hover:text-white transition-colors">Dashboard</Link>
        <Link href="#pricing" className="text-sm text-white/40 hover:text-white transition-colors">Pricing</Link>
        <Link href="#docs" className="text-sm text-white/40 hover:text-white transition-colors">Docs</Link>
      </div>

      <button className="bg-gold text-black text-xs font-bold px-5 py-2 rounded-full hover:bg-yellow-300 transition-colors">
        Get started
      </button>
    </nav>
  )
}
