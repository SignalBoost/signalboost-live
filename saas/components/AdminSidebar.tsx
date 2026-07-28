'use client'

import { useTranslation } from '@/components/i18n/useTranslation'

const COPY = {
  en: { navigation: 'Admin navigation', operator: 'Operator' },
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
