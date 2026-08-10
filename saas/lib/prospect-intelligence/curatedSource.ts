import curated from '@/data/prospects.json'

export type CuratedProspect = {
  id: string
  company: string
  country: string
  website: string
  email: string
  industry: string
  technicalFit: number
  revenuePotential: number
  status: string
}

export type CuratedProspectFilters = {
  country?: string
  industry?: string
  limit?: number
  requireEmail?: boolean
}

function clampLimit(value?: number) {
  const numeric = Number(value ?? 25)
  if (!Number.isFinite(numeric)) return 25
  return Math.max(1, Math.min(250, Math.trunc(numeric)))
}

export function getCuratedProspects(): readonly CuratedProspect[] {
  return Array.isArray(curated.prospects) ? curated.prospects as CuratedProspect[] : []
}

export function searchCuratedProspects(filters: CuratedProspectFilters = {}): CuratedProspect[] {
  const country = filters.country?.trim().toLowerCase()
  const industry = filters.industry?.trim().toLowerCase()
  return getCuratedProspects()
    .filter(row => row.status === 'READY')
    .filter(row => !country || row.country.toLowerCase() === country)
    .filter(row => !industry || row.industry.toLowerCase().includes(industry))
    .filter(row => !filters.requireEmail || Boolean(row.email?.trim()))
    .sort((a, b) => (b.technicalFit + b.revenuePotential) - (a.technicalFit + a.revenuePotential))
    .slice(0, clampLimit(filters.limit))
}
