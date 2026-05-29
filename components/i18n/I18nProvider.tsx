'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { detectLanguage } from '@/lib/i18n/detectLanguage'

type Dict = Record<string, string>
type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const dictionaries: Record<Lang, Dict> = {
  en: {
    'nav.home': 'Home', 'nav.podcasters': 'Podcasters', 'nav.pricing': 'Pricing', 'nav.docs': 'Docs', 'nav.dashboard': 'Dashboard',
    'landing.kicker': 'Native multilingual growth', 'landing.title': 'SignalBoost builds websites, reviews, audio, and video for every market.', 'landing.subtitle': 'Launch localized marketing workflows across English, Spanish, Portuguese, Polish, and Russian with English fallback.',
    'landing.cta': 'Open dashboard', 'landing.secondary': 'View pricing', 'pages.podcasters.title': 'Podcaster plan info', 'pages.pricing.title': 'Subscription pricing', 'pages.docs.title': 'Documentation', 'pages.support.title': 'Support', 'pages.faq.title': 'FAQ',
    'dashboard.title': 'Workspace modules', 'dashboard.subtitle': 'Choose a functional SignalBoost module.', 'projects.create': 'Create project', 'editor.preview': 'Preview', 'projects.title': 'Projects', 'projects.empty': 'No projects yet', 'billing.title': 'Billing', 'billing.current': 'Free plan', 'nav.automations': 'Automations', 'common.loading': 'Ready',
  },
  es: { 'nav.home':'Inicio','nav.podcasters':'Podcasters','nav.pricing':'Precios','nav.docs':'Docs','nav.dashboard':'Dashboard','landing.kicker':'Crecimiento multilingüe nativo','landing.title':'SignalBoost crea sitios, reseñas, audio y video para cada mercado.','landing.subtitle':'Lanza flujos localizados en inglés, español, portugués, polaco y ruso con respaldo en inglés.','landing.cta':'Abrir dashboard','landing.secondary':'Ver precios','pages.podcasters.title':'Información para podcasters','pages.pricing.title':'Precios de suscripción','pages.docs.title':'Documentación','pages.support.title':'Soporte','pages.faq.title':'FAQ' },
  pt: { 'nav.home':'Início','nav.podcasters':'Podcasters','nav.pricing':'Preços','nav.docs':'Docs','nav.dashboard':'Dashboard','landing.kicker':'Crescimento multilíngue nativo','landing.title':'SignalBoost cria sites, avaliações, áudio e vídeo para cada mercado.','landing.subtitle':'Lance fluxos localizados em inglês, espanhol, português, polonês e russo com fallback em inglês.','landing.cta':'Abrir dashboard','landing.secondary':'Ver preços','pages.podcasters.title':'Informações para podcasters','pages.pricing.title':'Preços de assinatura','pages.docs.title':'Documentação','pages.support.title':'Suporte','pages.faq.title':'FAQ' },
  pl: { 'nav.home':'Start','nav.podcasters':'Podcasterzy','nav.pricing':'Cennik','nav.docs':'Dokumenty','nav.dashboard':'Dashboard','landing.kicker':'Natywny wzrost wielojęzyczny','landing.title':'SignalBoost tworzy strony, opinie, audio i wideo dla każdego rynku.','landing.subtitle':'Uruchamiaj lokalne workflow po angielsku, hiszpańsku, portugalsku, polsku i rosyjsku z fallbackiem do angielskiego.','landing.cta':'Otwórz dashboard','landing.secondary':'Zobacz cennik','pages.podcasters.title':'Informacje dla podcasterów','pages.pricing.title':'Cennik subskrypcji','pages.docs.title':'Dokumentacja','pages.support.title':'Pomoc','pages.faq.title':'FAQ' },
  ru: { 'nav.home':'Главная','nav.podcasters':'Подкастеры','nav.pricing':'Цены','nav.docs':'Документы','nav.dashboard':'Панель','landing.kicker':'Нативный многоязычный рост','landing.title':'SignalBoost создает сайты, отзывы, аудио и видео для каждого рынка.','landing.subtitle':'Запускайте локализованные workflows на английском, испанском, португальском, польском и русском с fallback на английский.','landing.cta':'Открыть панель','landing.secondary':'Смотреть цены','pages.podcasters.title':'Информация для подкастеров','pages.pricing.title':'Цены подписки','pages.docs.title':'Документация','pages.support.title':'Поддержка','pages.faq.title':'FAQ' },
}

interface I18nContextProps { dict: Dict; lang: Lang; setLang: (lang: string) => void }
const I18nContext = createContext<I18nContextProps>({ dict: dictionaries.en, lang: 'en', setLang: () => {} })
const supported = ['en', 'es', 'pt', 'pl', 'ru'] as const
function normalize(lang: string): Lang { const short = lang.toLowerCase().slice(0,2); return supported.includes(short as Lang) ? short as Lang : 'en' }

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')
  useEffect(() => setLangState(normalize(detectLanguage())), [])
  const setLang = (next: string) => { const safe = normalize(next); localStorage.setItem('site-language', safe); setLangState(safe) }
  const dict = useMemo(() => ({ ...dictionaries.en, ...dictionaries[lang] }), [lang])
  return <I18nContext.Provider value={{ dict, lang, setLang }}>{children}</I18nContext.Provider>
}

export function useI18n() { return useContext(I18nContext) }
