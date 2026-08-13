'use client'

// saas/components/i18n/GeneratedContentLocalizer.tsx
// Translates rendered reports, documents, narratives, AI responses, and other
// generated long-form content whenever the platform language changes. UI chrome
// continues to use locale keys; this layer handles free text that cannot be
// known at build time. Original DOM text is retained separately and restored or
// retranslated from that source, so translations never translate translations.

import { useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type SupportedLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type TranslationSegment = { id: string; text: string }
type TranslationResponse = {
  ok?: boolean
  segments?: TranslationSegment[]
}

type NodeEntry = {
  id: string
  node: Text
  original: string
  sourceLanguage: string | null
  leading: string
  trailing: string
  text: string
}

type CacheEntry = {
  sourceHash: string
  translated: string
  touchedAt: number
}

const ORIGINAL_TEXT = new WeakMap<Text, string>()
const LAST_RENDERED_TEXT = new WeakMap<Text, string>()
const NODE_IDS = new WeakMap<Text, string>()
let nextNodeId = 1

const CACHE_KEY = 'signalboost_generated_content_translations_v1'
const CACHE_LIMIT = 500
const MAX_BATCH_SEGMENTS = 30
const MAX_BATCH_CHARS = 16_000

const EXPLICIT_ROOT_SELECTOR = [
  '[data-sb-generated-content]',
  '[data-sb-report]',
  '[data-sb-document]',
  '[data-generated-content]',
  '[data-report-content]',
  '[data-document-content]',
  '[data-ai-content]',
  '[data-message-role="assistant"]',
  '[data-role="assistant-message"]',
].join(',')

const SEMANTIC_ROOT_SELECTOR = [
  'article',
  '[role="document"]',
  '.prose',
  '.markdown-body',
  '.report-content',
  '.document-content',
  '.assistant-message',
  '.message-content',
].join(',')

const SKIP_SELECTOR = [
  'script',
  'style',
  'code',
  'pre',
  'kbd',
  'samp',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  '[contenteditable="true"]',
  '[data-sb-no-translate]',
  '[translate="no"]',
  'nav',
  '[role="navigation"]',
].join(',')

const STRUCTURED_TAGS = new Set([
  'P', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
])

function normalizeLanguage(value: string | null | undefined): SupportedLanguage {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(short)
    ? short as SupportedLanguage
    : 'en'
}

function nodeId(node: Text): string {
  const existing = NODE_IDS.get(node)
  if (existing) return existing
  const id = `generated-content-${nextNodeId++}`
  NODE_IDS.set(node, id)
  return id
}

function captureOriginal(node: Text): string {
  const current = node.nodeValue || ''
  const lastRendered = LAST_RENDERED_TEXT.get(node)
  const shouldCapture = !ORIGINAL_TEXT.has(node)
    || (lastRendered !== undefined && current !== lastRendered)
  if (shouldCapture) ORIGINAL_TEXT.set(node, current)
  return ORIGINAL_TEXT.get(node) || current
}

function containsHumanLanguage(value: string): boolean {
  return /\p{L}/u.test(value)
}

function isStandaloneTechnicalLiteral(value: string): boolean {
  const text = value.trim()
  if (/^https?:\/\/\S+$/i.test(text)) return true
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(text)) return true
  if (/^(?:[./~]|[A-Za-z]:\\)[^\s]+$/.test(text)) return true
  if (/^[\w@./:#-]+$/.test(text) && !/[\p{L}]{4,}/u.test(text.replace(/[_./:#-]/g, ' '))) return true
  return false
}

function sourceLanguageForNode(parent: Element): string | null {
  const boundary = parent.closest('[data-sb-source-language]')
  const explicit = boundary?.getAttribute('data-sb-source-language')
  return explicit ? normalizeLanguage(explicit) : null
}

function shouldTranslateNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent || parent.closest(SKIP_SELECTOR)) return false

  const value = (node.nodeValue || '').trim()
  if (!value || !containsHumanLanguage(value) || isStandaloneTechnicalLiteral(value)) return false

  const explicit = parent.closest(EXPLICIT_ROOT_SELECTOR)
  if (explicit) return value.length >= 2

  const semantic = parent.closest(SEMANTIC_ROOT_SELECTOR)
  if (semantic) return value.length >= 2

  const inMain = parent.closest('main')
  if (!inMain || !STRUCTURED_TAGS.has(parent.tagName)) return false

  // This catches generated report/document prose that has not yet adopted the
  // explicit data attributes while avoiding short navigation and control copy.
  return value.length >= 18
}

function collectEntries(): NodeEntry[] {
  const root = document.body
  if (!root) return []
  const entries: NodeEntry[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()

  while (current) {
    const node = current as Text
    if (shouldTranslateNode(node)) {
      const original = captureOriginal(node)
      const text = original.trim()
      if (text) {
        const parent = node.parentElement!
        entries.push({
          id: nodeId(node),
          node,
          original,
          sourceLanguage: sourceLanguageForNode(parent),
          leading: original.match(/^\s*/)?.[0] || '',
          trailing: original.match(/\s*$/)?.[0] || '',
          text,
        })
      }
    }
    current = walker.nextNode()
  }

  return entries
}

function fastHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function translationCacheKey(source: string, targetLanguage: string): string {
  return `${targetLanguage}:${source.length}:${fastHash(source)}`
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, CacheEntry>
      : {}
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, CacheEntry>) {
  try {
    const ordered = Object.entries(cache)
      .sort((a, b) => Number(b[1]?.touchedAt || 0) - Number(a[1]?.touchedAt || 0))
      .slice(0, CACHE_LIMIT)
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(ordered)))
  } catch {
    // Browser cache is an optimization; the server cache remains authoritative.
  }
}

function renderEntry(entry: NodeEntry, translated: string) {
  if (!entry.node.isConnected) return
  if (ORIGINAL_TEXT.get(entry.node) !== entry.original) return
  const rendered = `${entry.leading}${translated}${entry.trailing}`
  if (entry.node.nodeValue !== rendered) entry.node.nodeValue = rendered
  LAST_RENDERED_TEXT.set(entry.node, rendered)
}

function needsServerTranslation(entry: NodeEntry, targetLanguage: SupportedLanguage): boolean {
  if (entry.sourceLanguage === targetLanguage) return false

  // Untagged generated content is produced in the platform's canonical source
  // language (English). Treating sourceLanguage=null as "unknown" caused the
  // English UI to repeatedly send English prose to /api/i18n/translate-content
  // for an English→English no-op. Explicitly tagged non-English content still
  // translates to English normally.
  if (!entry.sourceLanguage && targetLanguage === 'en') return false
  return true
}

function documentIsHidden(): boolean {
  return document.visibilityState === 'hidden'
}

function batches(entries: NodeEntry[]): NodeEntry[][] {
  const out: NodeEntry[][] = []
  let batch: NodeEntry[] = []
  let chars = 0

  for (const entry of entries) {
    if (batch.length && (batch.length >= MAX_BATCH_SEGMENTS || chars + entry.text.length > MAX_BATCH_CHARS)) {
      out.push(batch)
      batch = []
      chars = 0
    }
    batch.push(entry)
    chars += entry.text.length
  }
  if (batch.length) out.push(batch)
  return out
}

async function requestTranslations(
  entries: NodeEntry[],
  targetLanguage: SupportedLanguage,
): Promise<Map<string, string>> {
  const sharedSourceLanguage = entries.every((entry) => entry.sourceLanguage === entries[0]?.sourceLanguage)
    ? entries[0]?.sourceLanguage
    : null

  const response = await fetch('/api/i18n/translate-content', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetLanguage,
      sourceLanguage: sharedSourceLanguage,
      contentKind: 'rendered-generated-content',
      segments: entries.map((entry) => ({ id: entry.id, text: entry.text })),
    }),
  })

  if (!response.ok) return new Map()
  const payload = await response.json().catch(() => null) as TranslationResponse | null
  if (!payload?.ok || !Array.isArray(payload.segments)) return new Map()
  return new Map(payload.segments.map((segment) => [String(segment.id), String(segment.text || '')]))
}

export default function GeneratedContentLocalizer() {
  const { lang } = useI18n()

  useEffect(() => {
    const targetLanguage = normalizeLanguage(lang)
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let running = false
    let rerun = false

    const translateDocument = async () => {
      if (cancelled || documentIsHidden()) return
      if (running) {
        rerun = true
        return
      }
      running = true

      do {
        rerun = false
        const cache = loadCache()
        const pending: NodeEntry[] = []

        for (const entry of collectEntries()) {
          if (!needsServerTranslation(entry, targetLanguage)) {
            renderEntry(entry, entry.text)
            continue
          }

          const key = translationCacheKey(entry.text, targetLanguage)
          const cached = cache[key]
          const sourceHash = fastHash(entry.text)
          if (cached?.sourceHash === sourceHash && typeof cached.translated === 'string') {
            cached.touchedAt = Date.now()
            renderEntry(entry, cached.translated)
          } else {
            pending.push(entry)
          }
        }

        for (const batch of batches(pending)) {
          if (cancelled || documentIsHidden()) break
          const translated = await requestTranslations(batch, targetLanguage)
          if (cancelled) break

          for (const entry of batch) {
            const value = translated.get(entry.id)
            if (typeof value !== 'string' || !value) continue
            cache[translationCacheKey(entry.text, targetLanguage)] = {
              sourceHash: fastHash(entry.text),
              translated: value,
              touchedAt: Date.now(),
            }
            renderEntry(entry, value)
          }
        }

        saveCache(cache)
      } while (rerun && !cancelled && !documentIsHidden())

      running = false
    }

    const schedule = () => {
      if (cancelled || documentIsHidden()) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void translateDocument() }, 180)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') schedule()
    }

    void translateDocument()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (timer) clearTimeout(timer)
    }
  }, [lang])

  return null
}
