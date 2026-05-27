import { useI18n } from "@/components/i18n/I18nProvider"
import { t } from "@/lib/i18n/t"

export default function Header() {
  const { dict } = useI18n()

  return (
    <header className="w-full px-6 py-4 flex items-center justify-between bg-[#0f0f0f] border-b border-white/10">
      <div className="text-white font-bold text-xl tracking-tight">⚡ SignalBoost</div>
      <nav className="hidden md:flex gap-6 text-sm text-white/60">
        <a href="#features" className="hover:text-white transition">{t(dict, "features", "Features")}</a>
        <a href="#how-it-works" className="hover:text-white transition">{t(dict, "howItWorks", "How it works")}</a>
        <a href="#pricing" className="hover:text-white transition">{t(dict, "pricing", "Pricing")}</a>
      </nav>
      <div className="flex gap-3">
        <a href="/login" className="text-sm text-white/70 hover:text-white transition px-4 py-2">{t(dict, "login", "Log in")}</a>
        <a href="/signup" className="text-sm bg-yellow-400 text-black font-semibold px-4 py-2 rounded-full hover:bg-yellow-300 transition">{t(dict, "signup", "Get started")}</a>
      </div>
    </header>
  )
}
