'use client'

import { useEffect, useState } from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, { nav: string; operator: string }> = {
  en: { nav: 'Admin navigation', operator: 'Operator' },
  es: { nav: 'Navegación de administración', operator: 'Operador' },
  pt: { nav: 'Navegação de administração', operator: 'Operador' },
  pl: { nav: 'Nawigacja administratora', operator: 'Operator' },
  ru: { nav: 'Навигация администратора', operator: 'Оператор' },
}

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const code = navigator.language?.slice(0, 2).toLowerCase()
  if (code === 'es') return 'es'
  if (code === 'pt') return 'pt'
  if (code === 'pl') return 'pl'
  if (code === 'ru') return 'ru'
  return 'en'
}

export default function AdminSidebar() {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    setLang(detectLang())
  }, [])

  const t = COPY[lang]

  return (
    <aside aria-label={t.nav}>
      <nav>
        <a href="/dashboard/operator">{t.operator}</a>
      </nav>
    </aside>
  )
}
