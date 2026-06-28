'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function Sidebar() {
  const pathname = usePathname()
  const { dict } = useI18n()

  const navItems = [
    { name: t(dict, 'dashboard', 'Dashboard'), path: '/dashboard' },
    { name: t(dict, 'marketingSalesCosa', 'Marketing & Sales COSA'), path: '/dashboard/cosa' },
    { name: t(dict, 'promoteBusiness', 'Promote business'), path: '/dashboard/promote' },
    { name: t(dict, 'buildWebsite', 'Build a website'), path: '/dashboard/builder' },
    { name: t(dict, 'collectReviews', 'Collect reviews'), path: '/dashboard/reviews' },
    { name: t(dict, 'generateAudio', 'Generate audio'), path: '/dashboard/audio' },
    { name: t(dict, 'createVideos', 'Create videos'), path: '/dashboard/video' },
    { name: t(dict, 'lab', 'Lab'), path: '/dashboard/lab' },
  ]

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col h-screen sticky top-0 border-r border-slate-800">
      <div className="p-6 border-b border-slate-800 flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">S</div>
        <span className="font-bold text-lg tracking-tight">SignalBoost</span>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {item.name}
            </Link>
          )
        })}
      </nav>

      <details className="p-4 border-t border-slate-800 text-sm">
        <summary className="cursor-pointer text-slate-300">{t(dict, 'support.help', 'Help')}</summary>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/faq" className="text-slate-400 hover:text-white">FAQ</Link>
          <Link href="/support" className="text-slate-400 hover:text-white">Contact Support</Link>
          <Link href="/docs" className="text-slate-400 hover:text-white">Documentation</Link>
        </div>
      </details>
    </aside>
  )
}
