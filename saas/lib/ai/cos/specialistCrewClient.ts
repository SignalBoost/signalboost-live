export const COS_SPECIALIST_ROLES = [
  // Canonical specialist families from ONBOARD.md.
  'software',
  'security',
  'marketing-sales',
  'design',
  'finance',
  'operations',
  'research',
  // Existing AI-department sub-specialties for narrower missions.
  'ml-engineer',
  'ai-engineer',
  'architect',
  'data-scientist',
  'data-engineer',
  'ethics',
] as const

export type CosSpecialistRole = (typeof COS_SPECIALIST_ROLES)[number]

export type SpecialistCrewMissionInput = {
  objective: string
  roles: CosSpecialistRole[]
  evidence?: string
  constraints?: string
  missionId?: string
}

export type SpecialistCrewMissionResult = {
  ok: boolean
  status: string
  mission_id?: string
  framework: 'crewai'
  roles?: string[]
  report?: string
  trace?: string[]
  memory?: { scope?: string; durable_memory_used?: boolean }
  authority?: {
    side_effects_allowed?: boolean
    approval_override_allowed?: boolean
    referee_override_allowed?: boolean
    persistent_memory_allowed?: boolean
  }
  error?: string
}

const ROLE_SET = new Set<string>(COS_SPECIALIST_ROLES)

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === 'host.docker.internal') return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  if (!host.includes('.')) return true // Kubernetes/Docker service name.
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true
  const m = /^172\.(\d{1,2})\./.exec(host)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true
  return host === '::1'
}

function coordinatorEndpoint(): string | null {
  const configured = String(process.env.COS_CREWAI_COORDINATOR_URL || '').trim()
  if (!configured) return null
  try {
    const parsed = new URL(configured)
    if (!['http:', 'https:'].includes(parsed.protocol) || !isPrivateHost(parsed.hostname)) return null
    return configured.replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalizeRoles(roles: readonly string[]): CosSpecialistRole[] {
  const unique: CosSpecialistRole[] = []
  for (const role of roles) {
    if (!ROLE_SET.has(role)) throw new Error(`Unsupported COS specialist role: ${role}`)
    if (!unique.includes(role as CosSpecialistRole)) unique.push(role as CosSpecialistRole)
  }
  if (!unique.length) throw new Error('At least one registered COS specialist is required.')
  if (unique.length > 5) throw new Error('A CrewAI mission may use at most five specialists.')
  return unique
}

export async function consultSpecialistCrew(
  input: SpecialistCrewMissionInput,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SpecialistCrewMissionResult> {
  const objective = String(input.objective || '').trim()
  if (!objective) throw new Error('Specialist mission objective is required.')
  if (objective.length > 8000) throw new Error('Specialist mission objective exceeds the 8000-character bound.')
  const roles = normalizeRoles(input.roles)
  const endpoint = coordinatorEndpoint()
  if (!endpoint) {
    return {
      ok: false,
      status: 'private_inference_unavailable',
      framework: 'crewai',
      error: 'COS_CREWAI_COORDINATOR_URL is not configured as a private/internal service endpoint. No hosted fallback was attempted.',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Math.min(options.timeoutMs ?? 120000, 180000)))
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(`${endpoint}/crew/missions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        mission_id: input.missionId,
        objective,
        roles,
        evidence: String(input.evidence || '').slice(0, 30000),
        constraints: String(input.constraints || '').slice(0, 30000),
        mode: 'analysis_only',
        authority: {
          allow_external_side_effects: false,
          allow_deploy: false,
          allow_permission_changes: false,
          allow_secret_access: false,
          allow_financial_actions: false,
          allow_owner_approval_override: false,
          allow_referee_override: false,
          allow_persistent_memory: false,
        },
      }),
    })

    let payload: any = null
    try { payload = await response.json() } catch {}
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        status: String(payload?.status || 'crew_unavailable'),
        framework: 'crewai',
        error: String(payload?.error || payload?.detail || `CrewAI coordinator returned HTTP ${response.status}.`),
      }
    }

    // Defense in depth: never accept a specialist response that claims authority the
    // host did not grant, even if the Python service were misconfigured.
    if (
      payload?.authority?.side_effects_allowed !== false ||
      payload?.authority?.approval_override_allowed !== false ||
      payload?.authority?.referee_override_allowed !== false ||
      payload?.authority?.persistent_memory_allowed !== false
    ) {
      return {
        ok: false,
        status: 'authority_boundary_violation',
        framework: 'crewai',
        error: 'CrewAI response did not preserve the COS read-only authority boundary.',
      }
    }

    return payload as SpecialistCrewMissionResult
  } catch (error) {
    return {
      ok: false,
      status: 'crew_unavailable',
      framework: 'crewai',
      error: error instanceof Error ? error.message : 'CrewAI coordinator request failed.',
    }
  } finally {
    clearTimeout(timeout)
  }
}
