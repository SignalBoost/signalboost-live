// saas/lib/cultural-calendar/helpers.ts
// Shared utilities used by every language greeting file.
// Kept separate from index.ts to avoid circular imports
// (each language file imports from helpers; index.ts imports from each language file).

export type GreetingContext = {
  firstName: string | null
  isNewUser: boolean
  isLoggedIn: boolean
}

export type Greeting = {
  headline: string
  subline: string
  emoji: string
}

// Random pick from array
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Insert the user's name into a template like "Welcome back, {name}!"
// If no name, gracefully drop the comma + name and leave a clean sentence.
export function fill(template: string, name: string | null): string {
  if (name) return template.replace('{name}', name)
  return template
    .replace(/, \{name\}/g, '')
    .replace(/ \{name\}/g, '')
    .replace(/\{name\}/g, '')
}

// Compute Easter Sunday for a given year (Gregorian, Meeus/Jones/Butcher algorithm)
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

// Carnaval window (Brazil/Spain): ~50 days before Easter to ~47 days before
export function carnavalRange(year: number): { startMonth: number; startDay: number; endMonth: number; endDay: number } {
  const easter = easterSunday(year)
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day))
  const start = new Date(easterDate.getTime() - 50 * 24 * 60 * 60 * 1000)
  const end   = new Date(easterDate.getTime() - 47 * 24 * 60 * 60 * 1000)
  return {
    startMonth: start.getUTCMonth() + 1,
    startDay:   start.getUTCDate(),
    endMonth:   end.getUTCMonth() + 1,
    endDay:     end.getUTCDate(),
  }
}

// Whether (month, day) falls inside [startM/startD, endM/endD] inclusive, handling year wrap.
export function inRange(month: number, day: number, startM: number, startD: number, endM: number, endD: number): boolean {
  const today = month * 100 + day
  const start = startM * 100 + startD
  const end   = endM * 100 + endD
  if (start <= end) return today >= start && today <= end
  return today >= start || today <= end
}

// Nth weekday of month. dow: 0=Sun..6=Sat
export function nthWeekdayOfMonth(year: number, month: number, dow: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const firstDow = first.getUTCDay()
  const offset = ((dow - firstDow + 7) % 7) + (n - 1) * 7
  return 1 + offset
}

// Last weekday of month
export function lastWeekdayOfMonth(year: number, month: number, dow: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month - 1, lastDay))
  const lastDow = last.getUTCDay()
  const offset = (lastDow - dow + 7) % 7
  return lastDay - offset
}
