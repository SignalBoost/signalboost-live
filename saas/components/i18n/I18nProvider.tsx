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

type SupportedLang = (typeof SUPPORTED_LANGS)[number]
type TranslatableAttr = 'placeholder' | 'aria-label' | 'title'

const ORIGINAL_TEXT = new WeakMap<Node, string>()
const LAST_TRANSLATED_TEXT = new WeakMap<Node, string>()
const ORIGINAL_ATTRS = new WeakMap<Element, Partial<Record<TranslatableAttr, string>>>()
const LAST_TRANSLATED_ATTRS = new WeakMap<Element, Partial<Record<TranslatableAttr, string>>>()

function normalizeLang(value: string | null) {
  if (!value) return 'en'

  const lower = value.toLowerCase()
  const match = SUPPORTED_LANGS.find((supportedLang) =>
    lower.startsWith(supportedLang)
  )

  return match ?? 'en'
}

function persistLanguage(lang: string) {
  if (typeof window === 'undefined') return normalizeLang(lang)

  const safe = normalizeLang(lang)
  localStorage.setItem('signalboost_language', safe)
  localStorage.setItem('site-language', safe)
  document.documentElement.lang = safe
  document.cookie = `signalboost_language=${encodeURIComponent(safe)}; Path=/; Max-Age=31536000; SameSite=Lax`
  return safe
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

  // Keep English as the explicit product default. Browser-language detection is
  // handled by LanguageSuggestion, so the dropdown and rendered UI never disagree.
  return 'en'
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

function translateFromOriginal(value: string, map: Map<string, string>, lang: SupportedLang) {
  if (lang === 'en') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const translated = map.get(trimmed)

  if (translated) return `${leading}${translated}${trailing}`
  return applyHardcodedUiCopy(value, lang)
}

function originalTextFor(node: Node, current: string) {
  const lastTranslated = LAST_TRANSLATED_TEXT.get(node)
  const shouldCaptureCurrent =
    !ORIGINAL_TEXT.has(node) ||
    (lastTranslated !== undefined && current !== lastTranslated)

  if (shouldCaptureCurrent) ORIGINAL_TEXT.set(node, current)
  return ORIGINAL_TEXT.get(node) ?? current
}

function originalAttrFor(el: Element, attr: TranslatableAttr, current: string) {
  const originalAttrs = ORIGINAL_ATTRS.get(el) ?? {}
  const lastAttrs = LAST_TRANSLATED_ATTRS.get(el) ?? {}
  const lastTranslated = lastAttrs[attr]
  const shouldCaptureCurrent =
    originalAttrs[attr] === undefined ||
    (lastTranslated !== undefined && current !== lastTranslated)

  if (shouldCaptureCurrent) {
    originalAttrs[attr] = current
    ORIGINAL_ATTRS.set(el, originalAttrs)
  }

  return originalAttrs[attr] ?? current
}

function rememberTranslatedAttr(el: Element, attr: TranslatableAttr, value: string) {
  const lastAttrs = LAST_TRANSLATED_ATTRS.get(el) ?? {}
  lastAttrs[attr] = value
  LAST_TRANSLATED_ATTRS.set(el, lastAttrs)
}

function applyLocaleSafetyNet(map: Map<string, string>, lang: SupportedLang) {
  if (typeof document === 'undefined') return () => {}

  const translateElement = (el: Element) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder) {
        const original = originalAttrFor(el, 'placeholder', el.placeholder)
        const translated = translateFromOriginal(original, map, lang)
        if (translated !== el.placeholder) el.placeholder = translated
        rememberTranslatedAttr(el, 'placeholder', translated)
      }
    }

    const aria = el.getAttribute('aria-label')
    if (aria) {
      const original = originalAttrFor(el, 'aria-label', aria)
      const translated = translateFromOriginal(original, map, lang)
      if (translated !== aria) el.setAttribute('aria-label', translated)
      rememberTranslatedAttr(el, 'aria-label', translated)
    }

    const title = el.getAttribute('title')
    if (title) {
      const original = originalAttrFor(el, 'title', title)
      const translated = translateFromOriginal(original, map, lang)
      if (translated !== title) el.setAttribute('title', translated)
      rememberTranslatedAttr(el, 'title', translated)
    }
  }

  const translateTextNode = (node: Node) => {
    if (node.nodeType !== Node.TEXT_NODE) return
    const parent = node.parentElement
    if (!parent) return
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'OPTION'].includes(parent.tagName)) return

    const current = node.textContent || ''
    const original = originalTextFor(node, current)
    const translated = translateFromOriginal(original, map, lang)

    if (translated !== current) node.textContent = translated
    LAST_TRANSLATED_TEXT.set(node, translated)
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
      if (record.type === 'attributes' && record.target instanceof Element) translateElement(record.target)
    }
  })
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title'],
    childList: true,
    characterData: true,
    subtree: true,
  })
  return () => observer.disconnect()
}

export function I18nProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [lang, setLangState] =
    useState<SupportedLang>('en')

  const [dict, setDict] =
    useState<Dict>(englishCopy as Dict)
  const [isReady, setIsReady] =
    useState(false)

  useEffect(() => {
    const initialLang = persistLanguage(getInitialLanguage())

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
      const safeLang = persistLanguage(lang)

      const loaded =
        await loadLanguage(safeLang)

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
    if (!isReady) return
    const map = new Map<string, string>()
    if (lang !== 'en') collectCopyPairs(englishCopy as Dict, dict, map)
    return applyLocaleSafetyNet(map, lang)
  }, [dict, isReady, lang])

  const setLang = async (
    newLang: string
  ) => {
    const safeLang =
      persistLanguage(newLang)

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
