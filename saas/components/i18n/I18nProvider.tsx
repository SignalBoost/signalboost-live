'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import englishCopy from '@/locales/en.json'
import { loadLanguage, type Dict, type DictValue } from '@/lib/i18n/loadLanguage'
import { applyHardcodedUiCopy } from '@/lib/i18n/hardcoded-ui-copy'

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

function isDict(value: DictValue | undefined): value is Dict {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectCopyPairs(english: Dict, localized: Dict, out: Map<string, string>) {
  for (const [key, enValue] of Object.entries(english)) {
    const locValue = localized[key]
    if (typeof enValue === 'string' && typeof locValue === 'string') {
      if (enValue && locValue && enValue !== locValue) out.set(enValue, locValue)
      continue
    }
    if (isDict(enValue) && isDict(locValue)) collectCopyPairs(enValue, locValue, out)
  }
}

function applyLocaleSafetyNet(map: Map<string, string>, lang: string) {
  if (typeof document === 'undefined') return () => {}

  const translateExact = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return value
    const translated = map.get(trimmed)
    if (translated) {
      const leading = value.match(/^\s*/)?.[0] || ''
      const trailing = value.match(/\s*$/)?.[0] || ''
      return `${leading}${translated}${trailing}`
    }
    return applyHardcodedUiCopy(value, lang)
  }

  const translateElement = (el: Element) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder) el.placeholder = translateExact(el.placeholder)
    }
    const aria = el.getAttribute('aria-label')
    if (aria) el.setAttribute('aria-label', translateExact(aria))
    const title = el.getAttribute('title')
    if (title) el.setAttribute('title', translateExact(title))
  }

  const translateTextNode = (node: Node) => {
    if (node.nodeType !== Node.TEXT_NODE) return
    const parent = node.parentElement
    if (!parent) return
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'].includes(parent.tagName)) return
    const current = node.textContent || ''
    const translated = translateExact(current)
    if (translated !== current) node.textContent = translated
  }

  const scan = (root: ParentNode) => {
    if (root instanceof Element) translateElement(root)
    root.querySelectorAll?.('input,textarea,[aria-label],[title]').forEach(translateElement)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) translateTextNode(node)
  }

  scan(document.body)
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node)
        if (node instanceof Element) scan(node)
      })
      if (record.type === 'characterData') translateTextNode(record.target)
    }
  })
  observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  return () => observer.disconnect()
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

  useEffect(() => {
    if (!isReady || lang === 'en') return
    const map = new Map<string, string>()
    collectCopyPairs(englishCopy as Dict, dict, map)
    return applyLocaleSafetyNet(map, lang)
  }, [dict, isReady, lang])

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
