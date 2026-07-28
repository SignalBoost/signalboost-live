'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const COPY = {
  en: { navigation: uiCopy('u_9eb199a84782f63f'), operator: uiCopy('u_dfb33ca11f19a938') },
  es: { navigation: 'Navegación de administración', operator: 'Operador' },
  pt: { navigation: 'Navegação administrativa', operator: 'Operador' },
  pl: { navigation: 'Nawigacja administracyjna', operator: 'Operator' },
  ru: { navigation: 'Навигация администратора', operator: 'Оператор' },
} as const

export default function AdminSidebar() {
  const { lang } = useTranslation()
  const copy = COPY[lang as keyof typeof COPY] ?? COPY.en

  return (
    <aside aria-label={copy.navigation}>
      <nav>
        <a href="/dashboard/operator">{copy.operator}</a>
      </nav>
    </aside>
  )
}
