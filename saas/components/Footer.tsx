export default function Footer() {
  return (
    <footer className="bg-[#0f0f0f] border-t border-white/10 px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-white font-bold text-lg">⚡ SignalBoost</div>
        <div className="flex gap-6 text-sm text-white/40">
          <a href="#" className="hover:text-white transition">Privacy</a>
          <a href="#" className="hover:text-white transition">Terms</a>
          <a href="#" className="hover:text-white transition">Contact</a>
        </div>
        <div className="text-white/30 text-xs">© {new Date().getFullYear()} SignalBoost. All rights reserved.</div>
      </div>
    </footer>
  )
}
