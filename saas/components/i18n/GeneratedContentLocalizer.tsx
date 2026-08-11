'use client'

// Translates only generated/document-style content. Normal page chrome/content is
// handled by locale dictionaries and must never trigger model calls on page load.

import { useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type SupportedLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type TranslationSegment = { id: string; text: string }
type TranslationResponse = { ok?: boolean; degraded?: boolean; segments?: TranslationSegment[] }
type NodeEntry = {
  id: string
  node: Text
  original: string
  sourceLanguage: SupportedLanguage | null
  leading: string
  trailing: string
  text: string
}
type CacheEntry = { sourceHash: string; translated: string; touchedAt: number }

const ORIGINAL_TEXT = new WeakMap<Text, string>()
const LAST_RENDERED_TEXT = new WeakMap<Text, string>()
const NODE_IDS = new WeakMap<Text, string>()
const FAILED_UNTIL = new Map<string, number>()
let nextNodeId = 1

const CACHE_KEY = 'signalboost_generated_content_translations_v1'
const CACHE_LIMIT = 500
const MAX_BATCH_SEGMENTS = 30
const MAX_BATCH_CHARS = 16_000
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000

const GENERATED_ROOT_SELECTOR = [
  '[data-sb-generated-content]',
  '[data-sb-report]',
  '[data-sb-document]',
  '[data-generated-content]',
  '[data-report-content]',
  '[data-document-content]',
  '[data-ai-content]',
  '[data-message-role="assistant"]',
  '[data-role="assistant-message"]',
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
  'script', 'style', 'code', 'pre', 'kbd', 'samp', 'input', 'textarea', 'select', 'option', 'button',
  '[contenteditable="true"]', '[data-sb-no-translate]', '[translate="no"]', 'nav', '[role="navigation"]',
].join(',')

function normalizeLanguage(value: string | null | undefined): SupportedLanguage {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(short) ? short as SupportedLanguage : 'en'
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
  if (!ORIGINAL_TEXT.has(node) || (lastRendered !== undefined && current !== lastRendered)) {
    ORIGINAL_TEXT.set(node, current)
  }
  return ORIGINAL_TEXT.get(node) || current
}

function containsHumanLanguage(value: string): boolean { return /\p{L}/u.test(value) }
function isStandaloneTechnicalLiteral(value: string): boolean {
  const text = value.trim()
  if (/^https?:\/\/\S+$/i.test(text)) return true
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(text)) return true
  if (/^(?:[./~]|[A-Za-z]:\\)[^\s]+$/.test(text)) return true
  return /^[\w@./:#-]+$/.test(text) && !/[\p{L}]{4,}/u.test(text.replace(/[_./:#-]/g, ' '))
}

function sourceLanguageForNode(parent: Element): SupportedLanguage | null {
  const sourceBoundary = parent.closest('[data-sb-source-language]')
  const explicitSource = sourceBoundary?.getAttribute('data-sb-source-language')
  if (explicitSource) return normalizeLanguage(explicitSource)
  const langBoundary = parent.closest('[lang]')
  const declared = langBoundary?.getAttribute('lang')
  return declared ? normalizeLanguage(declared) : null
}

function shouldTranslateNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent || parent.closest(SKIP_SELECTOR) || !parent.closest(GENERATED_ROOT_SELECTOR)) return false
  const value = (node.nodeValue || '').trim()
  return Boolean(value && value.length >= 2 && containsHumanLanguage(value) && !isStandaloneTechnicalLiteral(value))
}

function collectEntries(): NodeEntry[] {
  if (!document.body) return []
  const entries: NodeEntry[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    const node = current as Text
    if (shouldTranslateNode(node)) {
      const original = captureOriginal(node)
      const text = original.trim()
      if (text) {
        const parent = node.parentElement!
        entries.push({
          id: nodeId(node), node, original, sourceLanguage: sourceLanguageForNode(parent),
          leading: original.match(/^\s*/)?.[0] || '', trailing: original.match(/\s*$/)?.[0] || '', text,
        })
      }
    }
    current = walker.nextNode()
  }
  return entries
}

function fastHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}
function translationCacheKey(source: string, target: string): string { return `${target}:${source.length}:${fastHash(source)}` }
function failureKey(entry: NodeEntry, target: string): string { return `${target}:${fastHash(entry.text)}` }
function inFailureCooldown(entry: NodeEntry, target: string): boolean { return (FAILED_UNTIL.get(failureKey(entry, target)) || 0) > Date.now() }
function markFailure(entries: NodeEntry[], target: string) {
  const until = Date.now() + FAILURE_COOLDOWN_MS
  for (const entry of entries) FAILED_UNTIL.set(failureKey(entry, target), until)
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, CacheEntry> : {}
  } catch { return {} }
}
function saveCache(cache: Record<string, CacheEntry>) {
  try {
    const ordered = Object.entries(cache).sort((a, b) => Number(b[1]?.touchedAt || 0) - Number(a[1]?.touchedAt || 0)).slice(0, CACHE_LIMIT)
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(ordered)))
  } catch {}
}
function renderEntry(entry: NodeEntry, translated: string) {
  if (!entry.node.isConnected || ORIGINAL_TEXT.get(entry.node) !== entry.original) return
  const rendered = `${entry.leading}${translated}${entry.trailing}`
  if (entry.node.nodeValue !== rendered) entry.node.nodeValue = rendered
  LAST_RENDERED_TEXT.set(entry.node, rendered)
}
function batches(entries: NodeEntry[]): NodeEntry[][] {
  const out: NodeEntry[][] = []; let batch: NodeEntry[] = []; let chars = 0
  for (const entry of entries) {
    if (batch.length && (batch.length >= MAX_BATCH_SEGMENTS || chars + entry.text.length > MAX_BATCH_CHARS)) { out.push(batch); batch = []; chars = 0 }
    batch.push(entry); chars += entry.text.length
  }
  if (batch.length) out.push(batch)
  return out
}

async function requestTranslations(entries: NodeEntry[], targetLanguage: SupportedLanguage): Promise<{ ok: boolean; values: Map<string, string> }> {
  const sharedSourceLanguage = entries.every(entry => entry.sourceLanguage === entries[0]?.sourceLanguage) ? entries[0]?.sourceLanguage : null
  try {
    const response = await fetch('/api/i18n/translate-content', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage, sourceLanguage: sharedSourceLanguage, contentKind: 'rendered-generated-content', segments: entries.map(entry => ({ id: entry.id, text: entry.text })) }),
    })
    if (!response.ok) return { ok: false, values: new Map() }
    const payload = await response.json().catch(() => null) as TranslationResponse | null
    if (!payload?.ok || !Array.isArray(payload.segments)) return { ok: false, values: new Map() }
    return { ok: true, values: new Map(payload.segments.map(segment => [String(segment.id), String(segment.text || '')])) }
  } catch {
    return { ok: false, values: new Map() }
  }
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
      if (cancelled) return
      if (running) { rerun = true; return }
      running = true
      do {
        rerun = false
        const cache = loadCache()
        const pending: NodeEntry[] = []
        for (const entry of collectEntries()) {
          // Unknown-source generated content is treated as the platform default
          // language only when the target is English. This makes normal English
          // page loads zero-provider while preserving detection for other targets.
          const effectiveSource = entry.sourceLanguage ?? (targetLanguage === 'en' ? 'en' : null)
          if (effectiveSource === targetLanguage) { renderEntry(entry, entry.text); continue }
          const key = translationCacheKey(entry.text, targetLanguage)
          const cached = cache[key]
          const sourceHash = fastHash(entry.text)
          if (cached?.sourceHash === sourceHash && typeof cached.translated === 'string') {
            cached.touchedAt = Date.now(); renderEntry(entry, cached.translated)
          } else if (!inFailureCooldown(entry, targetLanguage)) {
            pending.push(entry)
          }
        }

        for (const batch of batches(pending)) {
          if (cancelled) break
          const result = await requestTranslations(batch, targetLanguage)
          if (cancelled) break
          if (!result.ok) { markFailure(batch, targetLanguage); continue }
          for (const entry of batch) {
            const value = result.values.get(entry.id)
            if (!value) continue
            cache[translationCacheKey(entry.text, targetLanguage)] = { sourceHash: fastHash(entry.text), translated: value, touchedAt: Date.now() }
            renderEntry(entry, value)
          }
        }
        saveCache(cache)
      } while (rerun && !cancelled)
      running = false
    }

    const schedule = () => {
      if (cancelled) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void translateDocument() }, 250)
    }
    void translateDocument()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => { cancelled = true; observer.disconnect(); if (timer) clearTimeout(timer) }
  }, [lang])
  return null
}
