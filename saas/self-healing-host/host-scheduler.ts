// Trusted host scheduler facts for the Self-Healing Supervisor.
//
// The scheduler configuration is version-controlled in vercel.json. Recovery code reads the
// deployed declaration directly instead of accepting a cadence value from an AI-generated plan.
import vercelConfig from '../vercel.json'

export const VERCEL_OBSERVATION_PATH = '/api/cron/vercel-observation'
export const NATIVE_PROACTIVE_MONITORING_PATH = '/api/cron/native-proactive-monitoring'

export interface HostCronCadence {
  path: string
  schedule: string
  maximumIntervalSeconds: number
}

function expandField(field: string, maxExclusive: number): number[] | null {
  const values = new Set<number>()
  for (const token of field.split(',').map(part => part.trim()).filter(Boolean)) {
    if (token === '*') {
      for (let value = 0; value < maxExclusive; value += 1) values.add(value)
      continue
    }
    if (token.startsWith('*/')) {
      const step = Number(token.slice(2))
      if (!Number.isInteger(step) || step <= 0 || step >= maxExclusive) return null
      for (let value = 0; value < maxExclusive; value += step) values.add(value)
      continue
    }
    const value = Number(token)
    if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) return null
    values.add(value)
  }
  return values.size ? [...values].sort((a, b) => a - b) : null
}

/**
 * Maximum time between ticks for the bounded minute/hour cron forms SignalBoost uses.
 * Unsupported calendar/range expressions fail closed to null rather than being guessed.
 */
export function cronMaximumIntervalSeconds(expression: string): number | null {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null
  const minutes = expandField(minuteField, 60)
  const hours = expandField(hourField, 24)
  if (!minutes || !hours) return null

  const occurrences = hours.flatMap(hour => minutes.map(minute => hour * 60 + minute)).sort((a, b) => a - b)
  if (!occurrences.length) return null
  let maximumGapMinutes = 0
  for (let index = 0; index < occurrences.length; index += 1) {
    const current = occurrences[index]
    const next = index === occurrences.length - 1 ? occurrences[0] + 24 * 60 : occurrences[index + 1]
    maximumGapMinutes = Math.max(maximumGapMinutes, next - current)
  }
  return maximumGapMinutes > 0 ? maximumGapMinutes * 60 : null
}

export function hostCronCadence(path: string): HostCronCadence | null {
  const item = (vercelConfig.crons ?? []).find(entry => entry.path === path)
  if (!item?.schedule) return null
  const maximumIntervalSeconds = cronMaximumIntervalSeconds(item.schedule)
  if (!maximumIntervalSeconds) return null
  return { path, schedule: item.schedule, maximumIntervalSeconds }
}

export function selfHealingHostCadence(): {
  vercelObservation: HostCronCadence | null
  nativeProactiveMonitoring: HostCronCadence | null
} {
  return {
    vercelObservation: hostCronCadence(VERCEL_OBSERVATION_PATH),
    nativeProactiveMonitoring: hostCronCadence(NATIVE_PROACTIVE_MONITORING_PATH),
  }
}
