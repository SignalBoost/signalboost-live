export type CosReasoningWorkerRole = 'primary' | 'coder' | 'critic' | 'verifier' | 'researcher'
export type CosReasoningWorkerKind = 'cos-open-model' | 'cos-deterministic' | 'external-closed-model'

export type CosReasoningRequest = {
  prompt: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  requestedRole?: CosReasoningWorkerRole
  allowExternalEscalation?: boolean
}

export type CosReasoningWorkerResult = {
  text: string
  turnId?: string | null
  confidence?: number | null
  metadata?: Record<string, unknown>
}

export type CosReasoningWorker = {
  id: string
  role: CosReasoningWorkerRole
  kind: CosReasoningWorkerKind
  label: string
  priority?: number
  execute(request: CosReasoningRequest): Promise<CosReasoningWorkerResult | null>
}

export type CosReasoningPlanStep = {
  id: string
  role: CosReasoningWorkerRole
  purpose: string
  required: boolean
}

export type CosReasoningPlan = {
  policyVersion: 'cos-reasoning-control-plane-v1'
  objective: string
  requestedRole: CosReasoningWorkerRole
  steps: CosReasoningPlanStep[]
}

export type CosReasoningExecution = {
  plan: CosReasoningPlan
  worker: Pick<CosReasoningWorker, 'id' | 'role' | 'kind' | 'label'>
  result: CosReasoningWorkerResult
  attemptedWorkerIds: string[]
  fallbackUsed: boolean
}

function cleanPrompt(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function workerOrder(a: CosReasoningWorker, b: CosReasoningWorker): number {
  return Number(b.priority ?? 0) - Number(a.priority ?? 0) || a.id.localeCompare(b.id)
}

export function buildCosReasoningPlan(request: CosReasoningRequest): CosReasoningPlan {
  const requestedRole = request.requestedRole ?? 'primary'
  return {
    policyVersion: 'cos-reasoning-control-plane-v1',
    objective: cleanPrompt(request.prompt).slice(0, 500),
    requestedRole,
    steps: [{
      id: `reason:${requestedRole}`,
      role: requestedRole,
      purpose: requestedRole === 'primary'
        ? 'Produce the COS-owned primary reasoning draft.'
        : `Use the ${requestedRole} capability while COS retains orchestration and acceptance authority.`,
      required: true,
    }],
  }
}

export class CosReasoningEngine {
  private readonly workers: CosReasoningWorker[]

  constructor(workers: readonly CosReasoningWorker[]) {
    const ids = new Set<string>()
    this.workers = []
    for (const worker of workers) {
      if (!worker?.id || ids.has(worker.id)) continue
      ids.add(worker.id)
      this.workers.push(worker)
    }
  }

  listWorkers(): Array<Pick<CosReasoningWorker, 'id' | 'role' | 'kind' | 'label' | 'priority'>> {
    return this.workers.map(({ id, role, kind, label, priority }) => ({ id, role, kind, label, priority }))
  }

  private eligibleWorkers(request: CosReasoningRequest, role: CosReasoningWorkerRole): CosReasoningWorker[] {
    return this.workers
      .filter(worker => worker.role === role)
      .filter(worker => request.allowExternalEscalation === true || worker.kind !== 'external-closed-model')
      .sort(workerOrder)
  }

  private candidateWorkers(request: CosReasoningRequest, plan: CosReasoningPlan): CosReasoningWorker[] {
    const specialists = this.eligibleWorkers(request, plan.requestedRole)
    if (plan.requestedRole === 'primary' || specialists.length > 0) return specialists
    // Phase 1 is behavior-preserving: if a specialist is not installed yet, the primary open-model
    // worker may still perform the task. This lets COS add roles without making any provider mandatory.
    return this.eligibleWorkers(request, 'primary')
  }

  async run(request: CosReasoningRequest): Promise<CosReasoningExecution | null> {
    if (!cleanPrompt(request.prompt)) return null
    const plan = buildCosReasoningPlan(request)
    const candidates = this.candidateWorkers(request, plan)
    const attemptedWorkerIds: string[] = []

    for (const worker of candidates) {
      attemptedWorkerIds.push(worker.id)
      const result = await worker.execute(request)
      if (!result?.text?.trim()) continue
      return {
        plan,
        worker: { id: worker.id, role: worker.role, kind: worker.kind, label: worker.label },
        result,
        attemptedWorkerIds,
        fallbackUsed: worker.role !== plan.requestedRole,
      }
    }

    return null
  }
}
