'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Sidebar() {
  const pathname = usePathname()
  const { dict } = useI18n()

  const navItems = [
    { name: t(dict, 'dashboard', uiCopy('u_ad9d361238517697')), path: '/dashboard' },
    { name: t(dict, 'marketingSalesCosa', uiCopy('u_d72020f3509e44d6')), path: '/dashboard/cosa' },
    { name: t(dict, 'promoteBusiness', uiCopy('u_80514c405b95b369')), path: '/dashboard/promote' },
    { name: t(dict, 'buildWebsite', uiCopy('u_d11aa11617eb5f5b')), path: '/dashboard/builder' },
    { name: t(dict, 'collectReviews', uiCopy('u_da1ffd51c6e58fec')), path: '/dashboard/reviews' },
    { name: t(dict, 'generateAudio', uiCopy('u_43f7e713492f1969')), path: '/dashboard/audio' },
    { name: t(dict, 'createVideos', uiCopy('u_d975dcb9d45d040a')), path: '/dashboard/video' },
    { name: t(dict, 'lab', uiCopy('u_046f67d9f1d15130')), path: '/dashboard/lab' },
  ]

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col h-screen sticky top-0 border-r border-slate-800">
      <div className="p-6 border-b border-slate-800 flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">S</div>
        <span className="font-bold text-lg tracking-tight">{uiCopy('u_d445151e8f176670')}</span>
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
        <summary className="cursor-pointer text-slate-300">{t(dict, 'support.help', uiCopy('u_bbbec6b4e8fdb65b'))}</summary>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/faq" className="text-slate-400 hover:text-white">{uiCopy('u_3f0778647c29e81b')}</Link>
          <Link href="/support" className="text-slate-400 hover:text-white"><LocalizedText fallback={uiCopy('u_37d6b62ed0348a89')} /></Link>
          <Link href="/docs" className="text-slate-400 hover:text-white">{uiCopy('u_4ba5e09f576b7b4d')}</Link>
        </div>
      </details>
    </aside>
  )
}
