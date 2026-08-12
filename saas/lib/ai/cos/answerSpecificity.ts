// saas/lib/ai/cos/answerSpecificity.ts
//
// A model scoring its own answer will not tell you the answer is vague. That is not a flaw in any
// particular model — it is what self-assessment is. COS's confidence gate consumed exactly that
// self-reported number, so a four-bucket answer ("resource contention", "configuration
// differences", "network issues") cleared a 0.72 threshold and was served as a confident result.
//
// This measures the one property a vague answer cannot fake: whether it names things you could
// actually go and look at. "Monitor resource usage" names nothing. "pg_stat_activity wait_event
// distribution" names an artifact — a view, a field, a counter, a command, a percentile, a unit.
//
// Deterministic on purpose. No second model judges the first, so this works with every external
// provider disabled, costs nothing, and cannot itself hallucinate. It also stays largely
// language-neutral: identifiers, percentiles and units look the same in English, Spanish,
// Portuguese, Polish and Russian, which matters because the reasoner answers in the user's
// language.
//
// The output is a CAP, never a boost. A specific answer is not thereby correct — specificity is
// necessary for a useful diagnostic answer, not sufficient for a right one. So this can only lower
// a claimed confidence, never raise it.

export type SpecificitySignals = {
  identifiers: string[]
  measurements: string[]
  commands: string[]
  falsifiers: number
}

export type SpecificityAssessment = {
  words: number
  applies: boolean
  artifacts: number
  density: number
  score: number
  cap: number
  signals: SpecificitySignals
}

/**
 * snake_case or dotted identifiers: pg_stat_statements, wait_event, http.server.duration,
 * LOCAL_AI_BASE_URL. An internal separator is REQUIRED, which is what makes this a usable signal:
 * bare acronyms like API, CPU, SQL and HTTP are category words that any generic answer contains by
 * the dozen, and counting them scored the four-bucket answer as specific during development.
 */
const IDENTIFIER = /\b[a-z][a-z0-9]*(?:[_.][a-z0-9]+)+\b/gi
/** Percentiles, durations, sizes, rates: p95, 300 ms, 4.5 GB, 120 rps, 30%. */
const MEASUREMENT = /\b(?:p\d{2,3}|\d+(?:\.\d+)?\s?(?:ms|s|m|h|kb|mb|gb|tb|rps|qps|tps|iops|%))\b/gi
/** Things you run or read: backticked spans, SQL verbs, CLI tools, paths. */
const COMMAND = /`[^`]{2,80}`|\b(?:SELECT|EXPLAIN|ANALYZE|VACUUM|SHOW|kubectl|psql|curl|dig|tcpdump|strace|perf)\b/g

/**
 * Words that introduce a disconfirming condition. Genuinely language-dependent, so this is a BONUS
 * signal only and never a requirement: a language whose terms are missing here must not be scored
 * as less rigorous than English.
 */
const FALSIFIER = /\b(?:rule out|rules out|ruled out|falsif\w*|disconfirm\w*|would not|wouldn't|if not|absent|descart\w+|refut\w+|excluir|wyklucz\w+|obal\w+|исключ\w+|опроверг\w+)\b/gi

/** Below this, an answer is a direct reply rather than an explanation, and is exempt. */
export function specificityWordFloor(): number {
  const raw = Number(process.env.COS_SPECIFICITY_WORD_FLOOR)
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 60
}

function matches(text: string, pattern: RegExp): string[] {
  return [...new Set((text.match(pattern) ?? []).map(value => value.toLowerCase().trim()))]
}

/**
 * Score an answer on whether it names checkable things, and derive the ceiling its confidence is
 * allowed to reach.
 *
 * Short answers are exempt entirely. "Your next invoice is due on the 14th" names no artifacts and
 * needs none; capping it would punish COS for being direct. The failure this targets is the long,
 * fluent, category-shaped answer, and that failure always comes with length.
 */
export function assessAnswerSpecificity(answer: string): SpecificityAssessment {
  const text = String(answer ?? '')
  const words = text.split(/\s+/).filter(Boolean).length
  const signals: SpecificitySignals = {
    identifiers: matches(text, IDENTIFIER),
    measurements: matches(text, MEASUREMENT),
    commands: matches(text, COMMAND),
    falsifiers: (text.match(FALSIFIER) ?? []).length,
  }
  const artifacts = new Set([...signals.identifiers, ...signals.measurements, ...signals.commands]).size
  const density = words ? artifacts / (words / 100) : 0

  if (words < specificityWordFloor()) {
    return { words, applies: false, artifacts, density, score: 1, cap: 1, signals }
  }

  // Both the absolute count and the rate matter: five artifacts in a paragraph is dense and
  // specific, five in two thousand words is a passing mention inside a wall of generality.
  const byCount = Math.min(1, artifacts / 6)
  const byDensity = Math.min(1, density / 2.5)
  const falsifierBonus = Math.min(0.1, signals.falsifiers * 0.05)
  const score = Number(Math.min(1, 0.6 * byCount + 0.4 * byDensity + falsifierBonus).toFixed(2))

  return { words, applies: true, artifacts, density: Number(density.toFixed(2)), score, cap: capForScore(score), signals }
}

/**
 * Ceilings, not scores. An answer naming nothing checkable is capped below any sane escalation
 * threshold so it is recorded as a gap instead of served as a confident result; a thoroughly
 * specific one is left alone for the evidence-based ceiling and the model's own number to decide.
 */
export function capForScore(score: number): number {
  if (score < 0.15) return 0.5
  if (score < 0.35) return 0.65
  if (score < 0.6) return 0.78
  return 1
}

/** Why a cap applied, in the words the gap log and the operator will read. */
export function specificityReason(assessment: SpecificityAssessment): string {
  const named = [...assessment.signals.identifiers, ...assessment.signals.measurements, ...assessment.signals.commands].slice(0, 6)
  return [
    `Answer specificity ${assessment.score.toFixed(2)} capped confidence at ${assessment.cap.toFixed(2)}:`,
    `${assessment.artifacts} checkable artifact${assessment.artifacts === 1 ? '' : 's'} named across ${assessment.words} words`,
    named.length ? `(${named.join(', ')})` : '(none named — no metric, view, counter, command or measurement to go and look at)',
  ].join(' ')
}
