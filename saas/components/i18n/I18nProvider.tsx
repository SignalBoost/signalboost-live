'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import englishCopy from '@/locales/en.json'
import { loadLanguage, type Dict } from '@/lib/i18n/loadLanguage'

type I18nContextType = {
  lang: string
  dict: Dict
  isReady: boolean
  setLang: (lang: string) => Promise<void>
}

const I18nContext =
  createContext<I18nContextType | null>(null)

const SUPPORTED_LANGS = [
  'en',
  'pt',
  'es',
  'pl',
  'ru',
] as const

function normalizeLang(value: string | null) {
  if (!value) return 'en'

  const lower = value.toLowerCase()
  const match = SUPPORTED_LANGS.find((supportedLang) =>
    lower.startsWith(supportedLang)
  )

  return match ?? 'en'
}

function persistLanguage(lang: string) {
  if (typeof window === 'undefined') return
  const safe = normalizeLang(lang)
  localStorage.setItem('signalboost_language', safe)
  localStorage.setItem('site-language', safe)
  document.cookie = `signalboost_language=${encodeURIComponent(safe)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const saved =
    localStorage.getItem('signalboost_language') ||
    localStorage.getItem('site-language')

  if (saved) {
    return normalizeLang(saved)
  }

  const browser =
    navigator.languages?.[0] ||
    navigator.language ||
    null

  return normalizeLang(browser)
}

export function I18nProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [lang, setLangState] =
    useState('en')

  const [dict, setDict] =
    useState<Dict>(englishCopy as Dict)
  const [isReady, setIsReady] =
    useState(false)

  useEffect(() => {
    const initialLang = getInitialLanguage()
    persistLanguage(initialLang)

    if (initialLang !== lang) {
      setLangState(initialLang)
    }
    // Run once after hydration so server and first client render both use English.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setIsReady(false)
      setDict(englishCopy as Dict)
      persistLanguage(lang)

      const loaded =
        await loadLanguage(lang)

      if (cancelled) return

      setDict(loaded)
      setIsReady(true)
    }

    init()
    return () => {
      cancelled = true
    }
  }, [lang])

  const setLang = async (
    newLang: string
  ) => {
    const safeLang =
      normalizeLang(newLang)

    persistLanguage(safeLang)
    setLangState(safeLang)
  }

  const value = useMemo(
    () => ({
      lang,
      dict,
      isReady,
      setLang,
    }),
    [lang, dict, isReady]
  )

  return (
    <I18nContext.Provider
      value={value}
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
