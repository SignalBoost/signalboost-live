'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

type ProductContext = {
  source?: string
  slug?: string
  title?: string
  workspaceHref?: string
  capturedAt?: string
}

const STORAGE_KEY = 'signalboost_product_context'

const COPY: Record<Lang, { prefix: string; body: string; continue: string; dismiss: string }> = {
  en: { prefix: uiText('generatedUi.u_1a2877296653964a'), body: uiText('generatedUi.u_723a333fc41aea3e'), continue: uiText('generatedUi.u_3ac48f57c27509c3'), dismiss: uiText('generatedUi.u_48845bff334a50a5') },
  es: { prefix: 'Llegaste por', body: 'SignalBoost recordó este producto localmente para que tu workspace empiece con contexto.', continue: 'Continuar configuración', dismiss: 'Cerrar' },
  pt: { prefix: 'Você veio por', body: 'O SignalBoost lembrou este produto localmente para que seu workspace comece com contexto.', continue: 'Continuar configuração', dismiss: 'Fechar' },
  pl: { prefix: 'Przyszedłeś po', body: 'SignalBoost zapamiętał ten produkt lokalnie, aby workspace zaczął z kontekstem.', continue: 'Kontynuuj konfigurację', dismiss: 'Zamknij' },
  ru: { prefix: 'Вы пришли за', body: 'SignalBoost сохранил этот продукт локально, чтобы workspace начался с контекстом.', continue: 'Продолжить настройку', dismiss: 'Закрыть' },
  de: { prefix: 'Sie sind hier für', body: 'SignalBoost hat sich dieses Produkt lokal gemerkt, damit Ihr Arbeitsbereich mit Kontext startet.', continue: 'Produkteinrichtung fortsetzen', dismiss: 'Verwerfen' },
  fr: { prefix: 'Vous êtes venu pour', body: 'SignalBoost a mémorisé ce produit localement afin que votre espace de travail démarre avec du contexte.', continue: 'Poursuivre la configuration du produit', dismiss: 'Ignorer' },
  it: { prefix: 'Sei qui per', body: 'SignalBoost ha memorizzato questo prodotto localmente, così il tuo spazio di lavoro parte già con il contesto.', continue: 'Continua la configurazione del prodotto', dismiss: 'Ignora' },
  ja: { prefix: 'ご利用の目的', body: 'SignalBoost はこの製品をローカルに記憶したため、ワークスペースはコンテキスト付きで開始されます。', continue: '製品のセットアップを続行', dismiss: '閉じる' },
  ko: { prefix: '방문 목적', body: 'SignalBoost가 이 제품을 로컬에 기억하여 작업 공간이 컨텍스트와 함께 시작됩니다.', continue: '제품 설정 계속', dismiss: '닫기' },
  ar: { prefix: 'جئت إلى هنا من أجل', body: 'تذكّر SignalBoost هذا المنتج محليًا لكي تبدأ مساحة عملك بالسياق.', continue: 'متابعة إعداد المنتج', dismiss: 'تجاهل' },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang
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
