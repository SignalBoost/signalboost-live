'use client'

import { useTranslation } from '@/components/i18n/useTranslation'
import { uiText } from '@/lib/i18n/uiText'

const COPY = {
  en: { navigation: uiText('generatedUi.u_3e761ea146251014'), operator: uiText('generatedUi.u_291101a07fe980e9') },
  es: { navigation: 'Navegación de administración', operator: 'Operador' },
  pt: { navigation: 'Navegação administrativa', operator: 'Operador' },
  pl: { navigation: 'Nawigacja administracyjna', operator: 'Operator' },
  ru: { navigation: 'Навигация администратора', operator: 'Оператор' },
  de: { navigation: 'Admin-Navigation', operator: 'Operator' },
  fr: { navigation: 'Navigation d’administration', operator: 'Opérateur' },
  it: { navigation: 'Navigazione amministratore', operator: 'Operatore' },
  ja: { navigation: '管理者ナビゲーション', operator: 'オペレーター' },
  ko: { navigation: '관리자 탐색', operator: '운영자' },
  ar: { navigation: 'تنقّل المسؤول', operator: 'المشغّل' },
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
