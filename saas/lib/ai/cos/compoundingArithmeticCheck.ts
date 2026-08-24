// Deterministic correction for compounded-rate claims.
const TOLERANCE_POINTS = 0.1
const RATE = /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:monthly|per\s+month|a\s+month)/i
const claimPattern = () => /(~|approximately\s+|roughly\s+|about\s+)?(\d{1,3}(?:\.\d+)?)\s*%\s*(remaining|of\s+(?:your|the)\s+(?:user\s+base|base|customers|revenue)|loss|lost)/gi
const horizonPattern = () => /(?:month\s*(\d{1,3})\b|(?:in|over|after)\s+(?:the\s+(?:remaining\s+)?)?(\d{1,3})\s+months)/gi

function formatLike(original: string, value: number): string {
  const decimals = original.includes('.') ? (original.split('.')[1]?.length ?? 1) : 1
  return value.toFixed(Math.min(decimals, 2))
}

export type CompoundingCorrection = {
  claimed: string
  corrected: string
  months: number
  ratePercent: number
  kind: 'remaining' | 'loss'
}

function horizonFor(text: string, claimIndex: number): number | null {
  const pattern = horizonPattern()
  let months: number | null = null
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > claimIndex) break
    if (claimIndex - match.index > 240) continue
    const value = Number(match[1] || match[2])
    if (Number.isFinite(value) && value > 0 && value <= 240) months = value
  }
  return months
}

export function correctCompoundingArithmetic(answer: string): { text: string; corrections: CompoundingCorrection[] } {
  const text = String(answer || '')
  if (!text) return { text, corrections: [] }
  const rateMatch = text.match(RATE)
  if (!rateMatch) return { text, corrections: [] }
  const ratePercent = Number(rateMatch[1])
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) return { text, corrections: [] }

  const corrections: CompoundingCorrection[] = []
  const out = text.replace(claimPattern(), (match: string, approx: string|undefined, claimedRaw: string, kindRaw: string, offset: number) => {
    const months = horizonFor(text, offset)
    if (months === null) return match
    const claimed = Number(claimedRaw)
    if (!Number.isFinite(claimed)) return match
    const remaining = Math.pow(1 - ratePercent / 100, months) * 100
    const kind: 'remaining' | 'loss' = /remaining/i.test(String(kindRaw)) ? 'remaining' : 'loss'
    const expected = kind === 'remaining' ? remaining : 100 - remaining
    if (Math.abs(expected - claimed) <= TOLERANCE_POINTS) return match
    const replacement = formatLike(String(claimedRaw), expected)
    corrections.push({ claimed: String(claimedRaw), corrected: replacement, months, ratePercent, kind })
    return `${approx ?? ''}${replacement}% ${kindRaw}`
  })
  return { text: out, corrections }
}
