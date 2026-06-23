// saas/lib/audit/uxDetector.ts
// UX Integrity pass — a cheap STATIC scan (no model calls) over the app/components
// source for the dead ends and placeholders that ship to logged-in users:
//   • dead links      href="#", href="javascript:void(0)"
//   • no-op handlers  onClick={() => {}} / onClick={undefined|null}
//   • placeholder text "Coming soon", "Lorem ipsum"
//   • unfinished      TODO / FIXME markers
//
// Returns findings in the same AuditFinding shape as the security scanner, so they
// merge straight into the run — visible in the findings panel, the Executive
// narrative, and the Remediation Roadmap, and fixable via the existing patch flow.
//
// Honest limits: this is STATIC analysis. It does NOT crawl a live deployment or
// detect blank / un-hydrated screens (that needs a headless browser — separate
// infra). Dead-click detection is deliberately conservative (only unambiguous
// no-op handlers) to avoid false positives.

import { readRepoFileFrom, type RepoTarget } from '@/lib/audit/repoTarget'
import type { AuditFinding, Severity } from '@/lib/audit/runner'

const UI_FILE  = /\.(tsx|jsx)$/i
const UI_DIR   = /(^|\/)(app|components)\//
// "Active admin / workspace surfaces" — a dead end here is Critical.
const ADMINISH = /(^|\/)app\/(admin|hub|dashboard)\//

const MAX_UX_FILES = 2000   // effectively a full-repo sweep of app/ + components/
const CONCURRENCY  = 8

interface Rule {
  category: string
  test: RegExp                       // must be global
  severity: (path: string) => Severity
  title: string
  detail: (match: string) => string
  recommendation: string
}

const RULES: Rule[] = [
  {
    category: 'ux-dead-link',
    test: /href\s*=\s*["']#["']/g,
    severity: p => (ADMINISH.test(p) ? 'critical' : 'high'),
    title: 'Dead link (href="#")',
    detail: () => 'Anchor links to "#" — it looks clickable but navigates nowhere.',
    recommendation: 'Point href at a real route, or replace the anchor with a <button onClick> wired to the intended action.',
  },
  {
    category: 'ux-dead-link',
    test: /href\s*=\s*["']javascript:void\(0\)["']/gi,
    severity: p => (ADMINISH.test(p) ? 'critical' : 'high'),
    title: 'Dead link (javascript:void(0))',
    detail: () => 'Anchor uses javascript:void(0) — a clickable element that does nothing.',
    recommendation: 'Use a real href, or a <button onClick> bound to the action.',
  },
  {
    category: 'ux-dead-click',
    test: /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}|onClick\s*=\s*\{\s*(?:undefined|null)\s*\}/g,
    severity: () => 'high',
    title: 'Dead click (empty / no-op handler)',
    detail: () => 'An onClick handler is empty or null/undefined — the control looks active but does nothing.',
    recommendation: 'Bind the handler to the intended action, or remove the control.',
  },
  {
    category: 'i18n-raw-string',
    test: /<button(?![^>]*onClick)(?![^>]*type\s*=\s*["']submit["'])[^>]*>/g,
    severity: () => 'high',
    title: 'Possible dead button (no handler)',
    detail: () => 'A <button> has no onClick handler and is not a submit button — likely a dead click. (Heuristic: a handler passed via spread/variable can be a false positive — verify.)',
    recommendation: 'Bind an onClick to the action, turn it into a link with a real href, set type="submit" inside a form, or remove the control.',
  },
  {
    // i18n enforcement: JSX text content (2+ words, starts with a capital) that is
    // NOT wrapped in the t() hook. Heuristic — multi-word UI labels written inline
    // instead of t('namespace.key', '…') trip this. Single words, expressions
    // ({...}), and punctuation-only nodes are ignored.
    category: 'i18n-raw-string',
    test: />\s*([A-Z][A-Za-z']+(?:\s+[A-Za-z'’.,!?:&/()-]+){1,})\s*</g,
    severity: () => 'high',
    title: 'Raw text not wired to i18n',
    detail: m => `User-facing text "${m.replace(/[<>]/g, '').trim()}" is hardcoded in JSX rather than wrapped in the i18n hook.`,
    recommendation: "Wrap it with t('namespace.key', 'fallback') via useTranslation() and add the key to the locale dictionaries (audit.{lang}.json / console.{lang}.json). Heuristic — verify it is genuinely user-facing copy.",
  },
  {
    category: 'ux-placeholder',
    test: /not\s+tracked\s+yet/gi,
    severity: () => 'high',
    title: 'Placeholder text: "Not tracked yet"',
    detail: m => `User-visible empty-state string "${m.trim()}" — a metric/card that never populates reads as a dead end to the user.`,
    recommendation: 'Wire this metric to a real data source (e.g. /api/admin/section-metrics). If genuinely pending, gate the panel behind a flag rather than shipping the string. Renaming the string alone does not fix the dead end.',
  },
  {
    category: 'ux-placeholder',
    test: /coming\s+soon/gi,
    severity: () => 'medium',
    title: 'Placeholder text: "Coming soon"',
    detail: m => `User-visible placeholder string found: "${m.trim()}".`,
    recommendation: 'Ship the real feature, or gate it behind a flag and remove the user-facing string. Move any remaining copy into a localized i18n key.',
  },
  {
    category: 'ux-placeholder',
    test: /lorem\s+ipsum/gi,
    severity: () => 'medium',
    title: 'Placeholder text: Lorem ipsum',
    detail: () => 'Lorem ipsum filler text is shipping to users.',
    recommendation: 'Replace with real localized copy via the i18n hook (useTranslation / useI18n).',
  },
  {
    category: 'ux-placeholder',
    test: /\b(TODO|FIXME)\b/g,
    severity: () => 'medium',
    title: 'Unfinished marker (TODO/FIXME)',
    detail: m => `Source contains an unfinished marker: ${m}.`,
    recommendation: 'Resolve the TODO/FIXME (or remove it) before shipping the component.',
  },
]

function lineOf(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) if (content.charCodeAt(i) === 10) line++
  return line
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function scanContent(path: string, content: string): AuditFinding[] {
  const out: AuditFinding[] = []
  for (const rule of RULES) {
    rule.test.lastIndex = 0
    const seenLines = new Set<number>()
    let m: RegExpExecArray | null
    while ((m = rule.test.exec(content)) !== null) {
      const ln = lineOf(content, m.index)
      if (seenLines.has(ln)) continue
      seenLines.add(ln)
      out.push({
        file:           path,
        line:           ln,
        severity:       rule.severity(path),
        category:       rule.category,
        title:          rule.title,
        detail:         rule.detail(m[0]),
        recommendation: rule.recommendation,
      })
      if (seenLines.size >= 25) break // cap per rule per file
      if (m.index === rule.test.lastIndex) rule.test.lastIndex++ // guard against zero-width
    }
  }
  return out
}

export async function runUxDetector(
  target: RepoTarget,
  allFiles: string[],
  opts?: { maxFiles?: number },
): Promise<AuditFinding[]> {
  const cap = Math.max(1, opts?.maxFiles ?? MAX_UX_FILES)
  const uiFiles = allFiles.filter(f => UI_FILE.test(f) && UI_DIR.test(f)).slice(0, cap)

  const perFile = await mapPool(uiFiles, CONCURRENCY, async (path) => {
    const file = await readRepoFileFrom(target.repo, target.branch, path)
    if (!file.ok || !file.content) return [] as AuditFinding[]
    return scanContent(path, file.content)
  })

  return perFile.flat()
}
