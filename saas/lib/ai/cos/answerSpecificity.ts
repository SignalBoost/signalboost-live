// saas/lib/ai/cos/answerSpecificity.ts
//
// Deterministic specificity gate. It never boosts model confidence; it only caps long answers
// that fail to name concrete, checkable artifacts or observables.

export type SpecificitySignals = {
  identifiers: string[]
  measurements: string[]
  commands: string[]
  domainArtifacts: string[]
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

const IDENTIFIER = /\b[a-z][a-z0-9]*(?:[_.][a-z0-9]+)+\b/gi
const MEASUREMENT = /\b(?:p\d{2,3}|\d+(?:\.\d+)?\s?(?:ms|s|m|h|kb|mb|gb|tb|rps|qps|tps|iops|%|hz|khz|n|nm|n·m|deg|°c|celsius|rad\/s))\b/gi
const COMMAND = /`[^`]{2,80}`|\b(?:SELECT|EXPLAIN|ANALYZE|VACUUM|SHOW|kubectl|psql|curl|dig|tcpdump|strace|perf)\b/g

// Concrete observables outside the original SRE-heavy detector. These are things an engineer can
// measure, inspect, log, or falsify directly. Multi-word phrases are deliberate: bare words such as
// "force", "temperature", or "probability" are too generic to count.
const DOMAIN_ARTIFACT = /\b(?:joint angle|joint velocity|joint acceleration|joint torque|motor current|motor temperature|winding temperature|thermal headroom|thermal limit|contact force|normal force|shear force|grip force|slip rate|slip event|tactile pressure|pressure map|taxel value|end[- ]effector pose|end[- ]effector velocity|pose error|trajectory error|tracking error|collision impulse|collision force|coefficient of friction|friction estimate|state covariance|covariance matrix|innovation residual|kalman gain|belief state|uncertainty bound|confidence interval|inverse kinematics residual|jacobian condition number|singularity measure|control loop latency|control frequency|actuator saturation|current limit|torque limit|temperature limit|thermal throttling|packet loss|queue depth|wait_event|lock wait|buffer hit rate|cache hit rate|disk latency|network latency)\b/gi

const FALSIFIER = /\b(?:rule out|rules out|ruled out|falsif\w*|disconfirm\w*|would not|wouldn't|if not|absent|descart\w+|refut\w+|excluir|wyklucz\w+|obal\w+|исключ\w+|опроверг\w+)\b/gi

export function specificityWordFloor(): number {
  const raw = Number(process.env.COS_SPECIFICITY_WORD_FLOOR)
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 60
}

function matches(text: string, pattern: RegExp): string[] {
  return [...new Set((text.match(pattern) ?? []).map(value => value.toLowerCase().trim()))]
}

export function assessAnswerSpecificity(answer: string): SpecificityAssessment {
  const text = String(answer ?? '')
  const words = text.split(/\s+/).filter(Boolean).length
  const signals: SpecificitySignals = {
    identifiers: matches(text, IDENTIFIER),
    measurements: matches(text, MEASUREMENT),
    commands: matches(text, COMMAND),
    domainArtifacts: matches(text, DOMAIN_ARTIFACT),
    falsifiers: (text.match(FALSIFIER) ?? []).length,
  }
  const artifacts = new Set([
    ...signals.identifiers,
    ...signals.measurements,
    ...signals.commands,
    ...signals.domainArtifacts,
  ]).size
  const density = words ? artifacts / (words / 100) : 0

  if (words < specificityWordFloor()) {
    return { words, applies: false, artifacts, density, score: 1, cap: 1, signals }
  }

  const byCount = Math.min(1, artifacts / 6)
  const byDensity = Math.min(1, density / 2.5)
  const falsifierBonus = Math.min(0.1, signals.falsifiers * 0.05)
  const score = Number(Math.min(1, 0.6 * byCount + 0.4 * byDensity + falsifierBonus).toFixed(2))

  return { words, applies: true, artifacts, density: Number(density.toFixed(2)), score, cap: capForScore(score), signals }
}

export function capForScore(score: number): number {
  if (score < 0.15) return 0.5
  if (score < 0.35) return 0.65
  if (score < 0.6) return 0.78
  return 1
}

export function specificityReason(assessment: SpecificityAssessment): string {
  const named = [
    ...assessment.signals.identifiers,
    ...assessment.signals.measurements,
    ...assessment.signals.commands,
    ...assessment.signals.domainArtifacts,
  ].slice(0, 6)
  return [
    `Answer specificity ${assessment.score.toFixed(2)} capped confidence at ${assessment.cap.toFixed(2)}:`,
    `${assessment.artifacts} checkable artifact${assessment.artifacts === 1 ? '' : 's'} named across ${assessment.words} words`,
    named.length ? `(${named.join(', ')})` : '(none named — no metric, view, counter, command, measurement, or domain observable to inspect)',
  ].join(' ')
}
