'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type ProductContext = {
  source?: string
  slug?: string
  title?: string
  workspaceHref?: string
  capturedAt?: string
}

const STORAGE_KEY = 'signalboost_product_context'

const COPY: Record<Lang, { prefix: string; body: string; continue: string; dismiss: string }> = {
  en: { prefix: 'You came here for', body: 'SignalBoost remembered this product locally so your workspace starts with context.', continue: 'Continue product setup', dismiss: 'Dismiss' },
  es: { prefix: 'Llegaste por', body: 'SignalBoost recordó este producto localmente para que tu workspace empiece con contexto.', continue: 'Continuar configuración', dismiss: 'Cerrar' },
  pt: { prefix: 'Você veio por', body: 'O SignalBoost lembrou este produto localmente para que seu workspace comece com contexto.', continue: 'Continuar configuração', dismiss: 'Fechar' },
  pl: { prefix: 'Przyszedłeś po', body: 'SignalBoost zapamiętał ten produkt lokalnie, aby workspace zaczął z kontekstem.', continue: 'Kontynuuj konfigurację', dismiss: 'Zamknij' },
  ru: { prefix: 'Вы пришли за', body: 'SignalBoost сохранил этот продукт локально, чтобы workspace начался с контекстом.', continue: 'Продолжить настройку', dismiss: 'Закрыть' },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
}

function readContext(): ProductContext | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ProductContext
    if (!parsed?.title || !parsed?.workspaceHref) return null
    return parsed
  } catch {
    return null
  }
}

export default function ProductContextBridge() {
  const pathname = usePathname()
  const { lang } = useI18n()
  const copy = COPY[activeLang(lang)]
  const [context, setContext] = useState<ProductContext | null>(null)

  useEffect(() => {
    if (!pathname?.startsWith('/dashboard')) {
      setContext(null)
      return
    }
    setContext(readContext())
  }, [pathname])

  if (!pathname?.startsWith('/dashboard') || !context) return null

  function dismiss() {
    window.localStorage.removeItem(STORAGE_KEY)
    setContext(null)
  }

  return (
    <section style={{ position: 'relative', zIndex: 2, background: 'linear-gradient(90deg, rgba(26,240,255,.12), rgba(255,195,0,.08))', borderBottom: '1px solid rgba(26,240,255,.22)', padding: '12px 22px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 14 }}>{copy.prefix} <span style={{ color: '#1af0ff' }}>{context.title}</span></div>
          <div style={{ color: 'rgba(226,232,240,.76)', fontSize: 12, marginTop: 3 }}>{copy.body}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={context.workspaceHref || '/dashboard'} style={{ borderRadius: 999, background: '#1af0ff', color: '#020617', padding: '8px 13px', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}>{copy.continue}</Link>
          <button type="button" onClick={dismiss} style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.05)', color: 'rgba(226,232,240,.82)', padding: '8px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{copy.dismiss}</button>
        </div>
      </div>
    </section>
  )
}
