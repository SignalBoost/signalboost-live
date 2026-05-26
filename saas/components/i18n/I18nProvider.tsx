'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { detectLanguage } from '@/lib/i18n/detectLanguage'
import { loadLanguage, type Dict } from '@/lib/i18n/loadLanguage'

type I18nContextType = {
  lang: string
  dict: Dict
  setLang: (lang: string) => void
}

const I18nContext =
  createContext<I18nContextType | null>(null)

const SUPPORTED_LANGS = [
  'en',
  'pt',
  'es',
  'pl',
  'ru',
]

function normalizeLang(value: string | null) {
  if (!value) return 'en'

  const lower = value.toLowerCase()

  if (lower.startsWith('pt')) return 'pt'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('pl')) return 'pl'
  if (lower.startsWith('ru')) return 'ru'
  if (lower.startsWith('en')) return 'en'

  return 'en'
}

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const saved =
    localStorage.getItem('signalboost_language') ||
    localStorage.getItem('site-language')

  if (
    saved &&
    SUPPORTED_LANGS.includes(saved)
  ) {
    return saved
  }

  const browser =
    navigator.languages?.[0] ||
    navigator.language ||
    null

  const browserLang =
    normalizeLang(browser)

  return browserLang
}

export function I18nProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [lang, setLangState] =
    useState('en')

  const [dict, setDict] =
    useState<Dict>({})

  useEffect(() => {
    async function init() {
      const initialLang =
        getInitialLanguage()

      const loaded =
        await loadLanguage(initialLang)

      setLangState(initialLang)
      setDict(loaded)
    }

    init()
  }, [])

  const setLang = async (
    newLang: string
  ) => {
    const safeLang =
      normalizeLang(newLang)

    localStorage.setItem(
      'signalboost_language',
      safeLang
    )

    localStorage.setItem(
      'site-language',
      safeLang
    )

    const loaded =
      await loadLanguage(safeLang)

    setLangState(safeLang)
    setDict(loaded)
  }

  return (
    <I18nContext.Provider
      value={{
        lang,
        dict,
        setLang,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx =
    useContext(I18nContext)

  if (!ctx) {
    throw new Error(
      'useI18n must be used inside I18nProvider'
    )
  }

  return ctx
}
