const REPO = 'SignalBoost/signalboost-live'

export type VerificationState = 'success' | 'pending' | 'failure' | 'error'

export interface VerificationResult {
  state: VerificationState
  summary: string
  evidence: string
  checkpoints: Record<string, boolean>
}

type CheckRun = {
  name?: string
  status?: string
  conclusion?: string | null
  details_url?: string | null
  output?: {
    title?: string | null
    summary?: string | null
    text?: string | null
  } | null
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'signalboost-cos-engineering',
  }
}

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function checkState(check: CheckRun): 'success' | 'pending' | 'failure' {
  if (check.status !== 'completed') return 'pending'
  return check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped'
    ? 'success'
    : 'failure'
}

function findCheck(checks: CheckRun[], matcher: RegExp): CheckRun | undefined {
  return checks.find(check => matcher.test(String(check.name || '')))
}

function describe(check: CheckRun | undefined): string {
  if (!check) return 'missing'
  const result = checkState(check)
  const output = clean([check.output?.title, check.output?.summary, check.output?.text].filter(Boolean).join(' | '), 3000)
  return `${check.name || 'unnamed'}=${result}${check.conclusion ? ` (${check.conclusion})` : ''}${output ? ` — ${output}` : ''}`
}

/**
 * Deterministic completion gate for COS software-engineering missions.
 *
 * A PR/commit existing is never enough. COS must observe concrete validation
 * signals emitted for the exact commit. Failed check output is returned as
 * grounded evidence so the next reasoning tick can repair the real failure.
 */
export async function verifyEngineeringCommit(sha: string): Promise<VerificationResult> {
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    return {
      state: 'error',
      summary: 'GitHub token is not configured for engineering verification.',
      evidence: 'No authenticated GitHub verification request was possible.',
      checkpoints: {},
    }
  }

  try {
    const checksRes = await fetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`, {
      headers: authHeaders(token),
      cache: 'no-store',
    })
    if (!checksRes.ok) {
      return {
        state: 'error',
        summary: `GitHub check-runs request failed (${checksRes.status}).`,
        evidence: clean(await checksRes.text().catch(() => '')),
        checkpoints: {},
      }
    }

    const payload = await checksRes.json()
    const checks: CheckRun[] = Array.isArray(payload?.check_runs) ? payload.check_runs : []

    const typecheck = findCheck(checks, /typecheck|tsc --noemit/i)
    const unitTests = findCheck(checks, /unit tests|\btest\b/i)
    const productionBuild = findCheck(checks, /production build|next build/i)
    const vercel = findCheck(checks, /^vercel$/i)

    // Vercel's production build runs this repository's prebuild guard before next build,
    // so a successful Vercel check is also hard evidence that the i18n prebuild gate ran.
    const checkpoints = {
      typecheck_passed: Boolean(typecheck && checkState(typecheck) === 'success') || Boolean(vercel && checkState(vercel) === 'success'),
      unit_tests_passed: Boolean(unitTests && checkState(unitTests) === 'success'),
      production_build_passed: Boolean(productionBuild && checkState(productionBuild) === 'success') || Boolean(vercel && checkState(vercel) === 'success'),
      i18n_validation_passed: Boolean(vercel && checkState(vercel) === 'success'),
      deployment_check_passed: Boolean(vercel && checkState(vercel) === 'success'),
    }

    const required = Object.values(checkpoints)
    const relevant = [typecheck, unitTests, productionBuild, vercel].filter(Boolean) as CheckRun[]
    const evidence = relevant.length
      ? relevant.map(describe).join('\n')
      : 'No required engineering check runs have appeared for this commit yet.'

    const failed = relevant.some(check => checkState(check) === 'failure')
    const pending = relevant.some(check => checkState(check) === 'pending') || !required.every(Boolean)

    if (failed) {
      return {
        state: 'failure',
        summary: 'One or more deterministic engineering checks failed. COS must diagnose the returned check evidence and repair the same mission.',
        evidence,
        checkpoints,
      }
    }

    if (pending) {
      return {
        state: 'pending',
        summary: 'Engineering verification is incomplete. Mission completion is forbidden until every required checkpoint is satisfied.',
        evidence,
        checkpoints,
      }
    }

    return {
      state: 'success',
      summary: 'All deterministic engineering completion gates passed for the exact commit.',
      evidence,
      checkpoints,
    }
  } catch (error) {
    return {
      state: 'error',
      summary: error instanceof Error ? error.message : 'Engineering verification failed.',
      evidence: 'Verification request threw before deterministic completion could be established.',
      checkpoints: {},
    }
  }
}
