// saas/lib/audit/findingFreshness.ts
//
// A FINDING IS A CLAIM ABOUT A FILE AT A MOMENT. THIS RE-ASKS THE FILE.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Audit findings are produced once, stored, and then displayed for as long as the
// run is kept — with nothing in between checking whether they are still true. On
// 5 Aug 2026 that produced a report the owner was about to act on in which:
//
//   · every phrase attributed to the live tree ("COS governance telemetry",
//     "Sandbox dashboard", "Prediction summary", "Approve and publish") existed
//     NOWHERE in the current source. Those files were localized on 27 Jul and now
//     carry ~39 i18n calls each. The findings were TRUE when written and false when
//     read, and nothing on screen distinguished the two;
//   · the remaining phrases were real, but about an orphaned app/ tree that is
//     not deployed — fixed separately in uxDetector's app-root resolution.
//
// A report that cannot tell "still broken" from "fixed last week" trains its
// reader to ignore it. That is worse than no report, because the ignoring
// generalizes to the findings that ARE real.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT WILL AND WILL NOT CLAIM
//
// Re-verification is only possible where the ORIGINAL RULE CAN BE RE-RUN. The UX
// and i18n rules are deterministic regexes, so they can. Model-written security
// findings cannot be — re-asking a model is a new opinion, not a verification.
//
// So the verdict space is deliberately four-valued, and three of them are not
// "confirmed":
//
//   confirmed     — the rule still matches this file. Act on it.
//   stale         — the rule no longer matches. Already fixed; stop showing it as open.
//   file-missing  — the file is gone from the repo. Also not actionable.
//   unverifiable  — no deterministic rule to re-run (model findings), or the file
//                   could not be read. NEVER downgraded to stale.
//
// The last one is the important one. A network blip, a rate limit, or an
// unrecognized category must never erase a real finding — unverifiable means "ask
// a human", not "probably fine". Failing closed here is the whole point: the
// failure this module exists to prevent was a report asserting things it had not
// checked, and a verifier that guesses would just be the same failure wearing a
// checkmark.

import { readRepoFileFrom } from '@/lib/audit/repoTarget'
import { I18N_RAW_STRING_SOURCE, i18nRawStringPhrases } from '@/lib/audit/uxDetector'
import type { AuditFinding } from '@/lib/audit/runner'

export type Freshness = 'confirmed' | 'stale' | 'file-missing' | 'unverifiable'

export interface VerifiedFinding extends AuditFinding {
  freshness: Freshness
  /** Plain-language reason, safe to show an operator. */
  freshnessReason: string
}

export interface FreshnessSummary {
  total: number
  confirmed: number
  stale: number
  missing: number
  unverifiable: number
  /** One line for the top of a report. */
  line: string
}

const CONCURRENCY = 8
const MAX_FILES = 400

// ─────────────────────────────────────────────────────────────────────────────
// The deterministic rules, keyed by the category the detector stamped.
//
// DUPLICATION IS ACKNOWLEDGED, NOT IGNORED: the i18n rule is imported from
// uxDetector's exported single source of truth, so the category most likely to
// churn cannot drift. The four UX patterns below are re-declared because
// uxDetector keeps its RULES array private. The right end-state is to export
// RULES and have this module read them; until then, a change to those four
// patterns must be made in both places, and this comment is here so the next
// person changing them finds out from the code rather than from a wrong report.
const UX_PATTERNS: Record<string, RegExp[]> = {
  'ux-dead-link': [
    /href\s*=\s*["']#["']/g,
    /href\s*=\s*["']javascript:void\(0\)["']/gi,
  ],
  'ux-dead-click': [
    /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}|onClick\s*=\s*\{\s*(?:undefined|null)\s*\}/g,
  ],
  'ux-placeholder': [
    />\s*not\s+tracked\s+yet\s*</gi,
    />\s*coming\s+soon\s*</gi,
    /lorem\s+ipsum/gi,
    /\b(TODO|FIXME)\b/g,
  ],
}

// Categories whose detail text embeds the FLAGGED PHRASE verbatim, so the phrase
// can be compared later. The others describe the defect in prose that happens to
// contain quotation marks — the dead-link detail says 'Anchor links to "#"', and
// reading "#" out of it as though it were the flagged phrase makes every dead
// link look stale. Found by this module's own test, which is why the extraction
// is keyed on category rather than on the presence of quotes.
const PHRASE_CATEGORIES = new Set(['i18n-raw-string', 'ux-placeholder'])

/**
 * The phrase a finding named, pulled back out of its own detail text.
 *
 * The detector writes the normalized phrase into detail verbatim precisely so it
 * can be compared later; this reads it back. Returns '' for categories that do
 * not embed one, in which case the category pattern alone decides.
 */
export function phraseFromDetail(detail?: string, category?: string): string {
  if (category !== undefined && !PHRASE_CATEGORIES.has(String(category))) return ''
  const m = String(detail || '').match(/"([^"]+)"/)
  return m ? m[1].trim() : ''
}

/**
 * Does this finding still reproduce against the given file content?
 *
 * `null` means "no deterministic rule for this category" — the caller must treat
 * that as unverifiable, not as either answer.
 */
export function stillReproduces(finding: AuditFinding, content: string): boolean | null {
  const category = String(finding.category || '')

  if (category === 'i18n-raw-string') {
    const phrase = phraseFromDetail(finding.detail, category)
    // Phrase present → compare exactly against what the detector would flag now.
    if (phrase) return i18nRawStringPhrases(content).indexOf(phrase) !== -1
    // No phrase recorded → fall back to "does the rule match this file at all".
    return new RegExp(I18N_RAW_STRING_SOURCE, 'g').test(content)
  }

  const patterns = UX_PATTERNS[category]
  if (!patterns) return null

  const phrase = phraseFromDetail(finding.detail, category)
  for (const rx of patterns) {
    const fresh = new RegExp(rx.source, rx.flags)
    if (!phrase) {
      if (fresh.test(content)) return true
      continue
    }
    // A phrase was recorded: the same pattern must still produce THAT phrase,
    // not merely some other match elsewhere in the file.
    let m: RegExpExecArray | null
    while ((m = fresh.exec(content)) !== null) {
      if (m[0].replace(/[<>]/g, '').trim().toLowerCase() === phrase.toLowerCase()) return true
      if (m.index === fresh.lastIndex) fresh.lastIndex++
    }
  }
  return false
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

/**
 * Re-check stored findings against the repository as it is NOW.
 *
 * Reads each distinct file once, so cost is files-touched, not findings-count.
 */
export async function verifyFindings(
  repo: string,
  branch: string,
  findings: AuditFinding[],
  opts?: { maxFiles?: number },
): Promise<VerifiedFinding[]> {
  const list = Array.isArray(findings) ? findings : []
  if (!list.length) return []

  // Only fetch files that carry at least one re-checkable finding.
  const recheckable = (f: AuditFinding) =>
    f.category === 'i18n-raw-string' || Boolean(UX_PATTERNS[String(f.category || '')])

  const wanted = [...new Set(list.filter(recheckable).map(f => String(f.file || '')).filter(Boolean))]
    .slice(0, Math.max(1, opts?.maxFiles ?? MAX_FILES))

  const contents = new Map<string, { ok: boolean; content: string }>()
  await mapPool(wanted, CONCURRENCY, async (path) => {
    const file = await readRepoFileFrom(repo, branch, path)
    contents.set(path, { ok: Boolean(file.ok), content: file.content || '' })
  })

  return list.map((f): VerifiedFinding => {
    if (!recheckable(f)) {
      return { ...f, freshness: 'unverifiable', freshnessReason: 'No deterministic rule to re-run for this category — verify by hand.' }
    }
    const got = contents.get(String(f.file || ''))
    if (!got) {
      return { ...f, freshness: 'unverifiable', freshnessReason: 'Not re-checked in this pass (file budget reached).' }
    }
    if (!got.ok) {
      // Could be deleted, could be a rate limit. Both are "do not assert".
      return { ...f, freshness: 'file-missing', freshnessReason: 'The file could not be read from the repository — it may have been moved, renamed or deleted.' }
    }
    const verdict = stillReproduces(f, got.content)
    if (verdict === null) {
      return { ...f, freshness: 'unverifiable', freshnessReason: 'No deterministic rule to re-run for this category — verify by hand.' }
    }
    return verdict
      ? { ...f, freshness: 'confirmed', freshnessReason: 'Still present in the current source.' }
      : { ...f, freshness: 'stale', freshnessReason: 'No longer present in the current source — fixed since this run was recorded.' }
  })
}

/** One honest line for the top of a report. */
export function summarizeFreshness(verified: VerifiedFinding[]): FreshnessSummary {
  const total = verified.length
  const confirmed = verified.filter(v => v.freshness === 'confirmed').length
  const stale = verified.filter(v => v.freshness === 'stale').length
  const missing = verified.filter(v => v.freshness === 'file-missing').length
  const unverifiable = verified.filter(v => v.freshness === 'unverifiable').length

  const parts = [`${confirmed} still present`]
  if (stale) parts.push(`${stale} already fixed`)
  if (missing) parts.push(`${missing} in files no longer readable`)
  if (unverifiable) parts.push(`${unverifiable} not machine-checkable`)

  return {
    total,
    confirmed,
    stale,
    missing,
    unverifiable,
    line: `Re-checked ${total} finding${total === 1 ? '' : 's'} against the current source: ${parts.join(', ')}.`,
  }
}

/** The findings worth acting on: confirmed, plus anything a machine could not judge. */
export function actionableFindings(verified: VerifiedFinding[]): VerifiedFinding[] {
  return verified.filter(v => v.freshness === 'confirmed' || v.freshness === 'unverifiable')
}
