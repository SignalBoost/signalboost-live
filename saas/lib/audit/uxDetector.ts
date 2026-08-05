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
//
// ─────────────────────────────────────────────────────────────────────────────
// AUG 5 2026 — IT WAS SCANNING CODE THAT IS NOT DEPLOYED.
//
// A monorepo can hold more than one app/ tree. This one holds two: a live
// saas/app + saas/components (348 UI files, the tree Vercel builds) and an
// orphaned root-level app/ + components/ (36 files, last touched in July and
// deployed nowhere). UI_DIR matched `(^|/)(app|components)/`, which is true of
// BOTH, so every scan reported the dead tree alongside the live one — the same
// page appearing twice under two paths, half the findings about code no user can
// reach. An operator reading that report cannot tell which half matters, and the
// rational response to a report that is half noise is to stop reading it.
//
// So the detector now RESOLVES ONE APP ROOT and scans only that, using signals in
// this order:
//   1. vercel.json — the deploy root. Vercel reads it from the project's Root
//      Directory, so the directory containing it is by definition what ships.
//   2. package.json — a real workspace rather than a stray folder.
//   3. UI file count — the tiebreak when a repo has neither marker.
//
// The skipped root is REPORTED, not silently dropped: skippedRoots comes back on
// the result so the run can say "36 files under app/ were not scanned because
// saas/ is the deployed root". Silently narrowing a scan is how a scanner starts
// lying by omission; this narrows it and says so.
//
// This is also the right behaviour for a BUYER's repo, which is the point of the
// audit: their monorepo may hold an app, a marketing site and an abandoned
// prototype, and only one of them is in production.

import { readRepoFileFrom, type RepoTarget } from '@/lib/audit/repoTarget'
import type { AuditFinding, Severity } from '@/lib/audit/runner'

const UI_FILE  = /\.(tsx|jsx)$/i
const UI_DIR   = /(^|\/)(app|components)\//
// "Active admin / workspace surfaces" — a dead end here is Critical.
const ADMINISH = /(^|\/)app\/(admin|hub|dashboard)\//

const MAX_UX_FILES = 2000   // effectively a full-repo sweep of app/ + components/
const CONCURRENCY  = 8

// ---------------------------------------------------------------------------
// i18n raw-string rule — SINGLE SOURCE OF TRUTH.
//
// The exact pattern that flags a hardcoded JSX text node. It is exported as a
// string (not a shared RegExp object) so the remediation engine can build its
// own fresh RegExp from it and ask "does the detector STILL flag this phrase?"
// using the identical rule that produced the finding. Detection and remediation
// must never drift apart — that drift is what let findings be reported "fixed"
// while the next scan re-flagged them. Any change to this pattern updates both
// the scanner and the remediation check at once.
//
// Matches: JSX text content (2+ words, starts with a capital) NOT wrapped in the
// t() hook. Single words, expressions ({...}), and punctuation-only nodes are
// ignored.
export const I18N_RAW_STRING_SOURCE = ">\\s*([A-Z][A-Za-z']+(?:\\s+[A-Za-z'’.,!?:&/()-]+){1,})\\s*<"

// The normalized phrase a match produces — used verbatim in finding.detail, so
// the remediation engine can compare against the stored finding text exactly.
function normalizePhrase(match: string): string {
  return match.replace(/[<>]/g, '').trim()
}

// Every distinct hardcoded phrase the i18n rule flags in a file. Builds a fresh
// RegExp per call (no shared lastIndex state → safe under concurrent scans).
export function i18nRawStringPhrases(content: string): string[] {
  const rx = new RegExp(I18N_RAW_STRING_SOURCE, 'g')
  const out = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = rx.exec(content)) !== null) {
    out.add(normalizePhrase(m[0]))
    if (m.index === rx.lastIndex) rx.lastIndex++ // guard against zero-width
  }
  return [...out]
}

// ---------------------------------------------------------------------------
// APP ROOT RESOLUTION
// ---------------------------------------------------------------------------

/** The directory prefix a UI path sits under: 'saas/app/x.tsx' → 'saas/', 'app/x.tsx' → ''. */
function rootOf(path: string): string {
  const m = path.match(/^(.*?)(?:app|components)\//)
  return m ? m[1] : ''
}

export interface AppRootChoice {
  /** The prefix that will be scanned ('' means the repository root). */
  root: string
  /** Prefixes deliberately NOT scanned, with the file count each would have contributed. */
  skipped: Array<{ root: string; files: number }>
  /** Which signal decided it, for the run log. */
  reason: 'vercel.json' | 'package.json' | 'file-count' | 'single-root'
}

/**
 * Choose the ONE app root to scan.
 *
 * `allFiles` is the whole repo tree, so the markers (vercel.json / package.json)
 * are looked up in it directly — no extra network reads.
 */
export function resolveAppRoot(allFiles: string[]): AppRootChoice {
  const counts = new Map<string, number>()
  for (const f of allFiles) {
    if (!UI_FILE.test(f) || !UI_DIR.test(f)) continue
    const r = rootOf(f)
    counts.set(r, (counts.get(r) || 0) + 1)
  }
  const roots = [...counts.keys()]
  if (roots.length <= 1) {
    return { root: roots[0] ?? '', skipped: [], reason: 'single-root' }
  }

  const has = (root: string, name: string) => allFiles.includes(`${root}${name}`)
  let chosen = ''
  let reason: AppRootChoice['reason'] = 'file-count'

  const deployRoots = roots.filter(r => has(r, 'vercel.json'))
  const pkgRoots = roots.filter(r => has(r, 'package.json'))
  const byCount = (list: string[]) => [...list].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0]

  if (deployRoots.length) { chosen = byCount(deployRoots); reason = 'vercel.json' }
  else if (pkgRoots.length) { chosen = byCount(pkgRoots); reason = 'package.json' }
  else { chosen = byCount(roots); reason = 'file-count' }

  const skipped = roots
    .filter(r => r !== chosen)
    .map(r => ({ root: r || '<repo root>', files: counts.get(r) || 0 }))
    .sort((a, b) => b.files - a.files)

  return { root: chosen, skipped, reason }
}

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
    // i18n enforcement: JSX text content (2+ words, starts with a capital) that is
    // NOT wrapped in the t() hook. Heuristic — multi-word UI labels written inline
    // instead of t('namespace.key', '…') trip this. Single words, expressions
    // ({...}), and punctuation-only nodes are ignored. Pattern shared with the
    // remediation engine via I18N_RAW_STRING_SOURCE (fresh RegExp per file).
    category: 'i18n-raw-string',
    test: new RegExp(I18N_RAW_STRING_SOURCE, 'g'),
    severity: () => 'high',
    title: 'Raw text not wired to i18n',
    detail: m => `User-facing text "${normalizePhrase(m)}" is hardcoded in JSX rather than wrapped in the i18n hook.`,
    recommendation: "Wrap it with t('namespace.key', 'fallback') via useTranslation() and add the key to the locale dictionaries (audit.{lang}.json / console.{lang}.json). Heuristic — verify it is genuinely user-facing copy.",
  },
  {
    category: 'ux-placeholder',
    test: />\s*not\s+tracked\s+yet\s*</gi,
    severity: () => 'high',
    title: 'Placeholder text: "Not tracked yet"',
    detail: m => `User-visible empty-state string "${m.replace(/[<>]/g, '').trim()}" — a metric/card that never populates reads as a dead end to the user.`,
    recommendation: 'Wire this metric to a real data source (e.g. /api/admin/section-metrics). If genuinely pending, gate the panel behind a flag rather than shipping the string. Renaming the string alone does not fix the dead end.',
  },
  {
    category: 'ux-placeholder',
    test: />\s*coming\s+soon\s*</gi,
    severity: () => 'medium',
    title: 'Placeholder text: "Coming soon"',
    detail: m => `User-visible placeholder string found: "${m.replace(/[<>]/g, '').trim()}".`,
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
  opts?: { maxFiles?: number; onRootChoice?: (choice: AppRootChoice) => void },
): Promise<AuditFinding[]> {
  const cap = Math.max(1, opts?.maxFiles ?? MAX_UX_FILES)

  // ONE app root, chosen from the repo's own deploy markers. Without this the scan
  // reports orphaned trees as though they were live — see the header note.
  const choice = resolveAppRoot(allFiles)
  if (opts?.onRootChoice) opts.onRootChoice(choice)

  const uiFiles = allFiles
    .filter(f => UI_FILE.test(f) && UI_DIR.test(f) && rootOf(f) === choice.root)
    .slice(0, cap)

  const perFile = await mapPool(uiFiles, CONCURRENCY, async (path) => {
    const file = await readRepoFileFrom(target.repo, target.branch, path)
    if (!file.ok || !file.content) return [] as AuditFinding[]
    return scanContent(path, file.content)
  })

  return perFile.flat()
}
