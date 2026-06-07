'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { detectLanguage } from '@/lib/i18n/detectLanguage'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import pt from '@/locales/pt.json'
import pl from '@/locales/pl.json'
import ru from '@/locales/ru.json'

type Dict = Record<string, string>
export type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const dictionaries: Record<Lang, Dict> = { en, es, pt, pl, ru }
const supported = ['en', 'es', 'pt', 'pl', 'ru'] as const

interface I18nContextProps {
  dict: Dict
  lang: Lang
  locale: Lang
  setLang: (lang: string) => void
}

function normalize(lang: string): Lang {
  const short = lang.toLowerCase().slice(0, 2)
  return supported.includes(short as Lang) ? (short as Lang) : 'en'
}

const I18nContext = createContext<I18nContextProps>({
  dict: dictionaries.en,
  lang: 'en',
  locale: 'en',
  setLang: () => {},
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => setLangState(normalize(detectLanguage())), [])

  const setLang = (next: string) => {
    const safe = normalize(next)
    localStorage.setItem('site-language', safe)
    document.cookie = `NEXT_LOCALE=${safe}; path=/; max-age=31536000; SameSite=Lax`
    setLangState(safe)
  }

  const dict = useMemo(() => ({ ...dictionaries.en, ...dictionaries[lang] }), [lang])
  return <I18nContext.Provider value={{ dict, lang, locale: lang, setLang }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
