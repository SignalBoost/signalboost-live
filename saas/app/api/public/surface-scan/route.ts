// saas/app/api/public/surface-scan/route.ts
// Public lead-magnet dependency surface scan.
// Safe by design: public GitHub repos only, capped package count, no persistence,
// no remediation plan, no PR preparation, and no private source-code analysis.

import { NextResponse } from 'next/server'
import { scanDependencyAdvisories } from '@/lib/cyber/dependencyScanner'
import { parseRepoUrl } from '@/lib/audit/repoTarget'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BODY_BYTES = 4_000
const MAX_PUBLIC_PACKAGES = 75
const MAX_PUBLIC_ADVISORIES = 8
const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 10
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type SurfaceScanBody = {
  url?: unknown
  maxPackages?: unknown
}

async function readJsonLimited(req: Request): Promise<{ ok: true; value: SurfaceScanBody } | { ok: false; error: string; status: number }> {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, error: 'Content-Type must be application/json', status: 415 }
  }
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'Request body is too large', status: 413 }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object') return { ok: false, error: 'Invalid JSON body', status: 400 }
    return { ok: true, value: value as SurfaceScanBody }
  } catch {
    return { ok: false, error: 'Invalid JSON body', status: 400 }
  }
}

function sameOriginOk(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function clientIpKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string) {
  const now = Date.now()
  const existing = rateBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  existing.count += 1
  if (existing.count % 50 === 0 || rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
    }
  }
  return existing.count > RATE_MAX
}

function severityRank(value: string) {
  const ranks: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }
  return ranks[String(value || 'unknown')] ?? 4
}

function safeUrl(value: unknown) {
  return String(value || '').trim().slice(0, 300)
}

function publicAdvisory(a: any) {
  return {
    id: String(a?.id || 'unknown'),
    packageName: String(a?.packageName || 'package'),
    version: String(a?.version || 'unknown'),
    sourceFile: String(a?.sourceFile || 'package manifest'),
    severity: String(a?.severity || 'unknown'),
    summary: String(a?.summary || 'Dependency advisory found.').slice(0, 280),
    detailsUrl: a?.detailsUrl ? String(a.detailsUrl) : null,
    fixedVersionAvailable: Array.isArray(a?.fixedVersions) && a.fixedVersions.length > 0,
  }
}

export async function POST(req: Request) {
  // Same-origin first so rejected browser CSRF attempts do not consume the public
  // scan quota. Direct/originless clients can still pass and are rate-limited.
  if (!sameOriginOk(req)) {
    return NextResponse.json({ ok: false, error: 'Cross-origin request rejected' }, { status: 403 })
  }

  const ipKey = clientIpKey(req)
  if (rateLimited(`public-surface-scan:${ipKey}`)) {
    return NextResponse.json({ ok: false, error: 'Too many scans from this network. Please try again later.' }, { status: 429 })
  }

  const parsed = await readJsonLimited(req)
  if (parsed.ok === false) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status })
  }

  const url = safeUrl(parsed.value?.url)
  const target = parseRepoUrl(url)
  if (!target) {
    return NextResponse.json({ ok: false, error: 'Paste a valid public GitHub repository URL, for example https://github.com/owner/repo.' }, { status: 400 })
  }

  const requestedMax = Number(parsed.value?.maxPackages || MAX_PUBLIC_PACKAGES)
  const maxPackages = Math.max(1, Math.min(MAX_PUBLIC_PACKAGES, Number.isFinite(requestedMax) ? requestedMax : MAX_PUBLIC_PACKAGES))
  const report = await scanDependencyAdvisories({ url, maxPackages })
  const advisories = Array.isArray(report.advisories) ? report.advisories : []
  const topAdvisories = advisories
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || String(a.packageName).localeCompare(String(b.packageName)))
    .slice(0, MAX_PUBLIC_ADVISORIES)
    .map(publicAdvisory)

  return NextResponse.json({
    ok: report.ok,
    error: report.error || null,
    scanMode: 'public_surface_scan',
    generatedAt: report.generatedAt,
    target: report.target,
    repo: report.repo,
    branch: report.branch,
    summary: report.summary,
    topAdvisories,
    limits: {
      maxPackages,
      maxAdvisoriesShown: MAX_PUBLIC_ADVISORIES,
      remediationLocked: true,
      privateReposSupported: false,
    },
    upgrade: {
      productLine: 'audit',
      plan: 'Pro',
      monthlyPrice: 199,
      unlocks: [
        'Full issue review report',
        'Remediation plan',
        'Human-approved GitHub PR preparation',
        'Scheduled monitoring and alert inbox',
      ],
    },
  }, { status: report.ok ? 200 : 400 })
}
