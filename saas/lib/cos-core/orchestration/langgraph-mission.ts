import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

export type COSMissionVerification = {
  ok: boolean
  reason?: string
}

export type COSMissionGraphDependencies<TInput, TPlan, TResult> = {
  plan: (input: TInput) => Promise<TPlan> | TPlan
  execute: (context: { input: TInput; plan: TPlan; attempt: number }) => Promise<TResult> | TResult
  verify: (context: { input: TInput; plan: TPlan; result: TResult; attempt: number }) => Promise<COSMissionVerification> | COSMissionVerification
  repair?: (context: { input: TInput; plan: TPlan; result: TResult; attempt: number; reason?: string }) => Promise<TPlan> | TPlan
  onTransition?: (event: COSMissionTransition) => Promise<void> | void
}

export type COSMissionTransition = {
  stage: 'plan' | 'execute' | 'verify' | 'repair'
  attempt: number
  verified?: boolean
  reason?: string
}

export type COSMissionGraphResult<TPlan, TResult> = {
  status: 'verified' | 'unverified'
  plan: TPlan
  result: TResult
  attempts: number
  reason?: string
  trace: string[]
}

type MissionStateValue<TInput, TPlan, TResult> = {
  input: TInput
  plan?: TPlan
  result?: TResult
  attempt: number
  maxAttempts: number
  verified: boolean
  reason?: string
  trace: string[]
}

const MissionState = Annotation.Root({
  input: Annotation<unknown>(),
  plan: Annotation<unknown | undefined>(),
  result: Annotation<unknown | undefined>(),
  attempt: Annotation<number>({ default: () => 0, reducer: (_current, update) => update }),
  maxAttempts: Annotation<number>({ default: () => 2, reducer: (_current, update) => update }),
  verified: Annotation<boolean>({ default: () => false, reducer: (_current, update) => update }),
  reason: Annotation<string | undefined>({ default: () => undefined, reducer: (_current, update) => update }),
  trace: Annotation<string[]>({ default: () => [], reducer: (current, update) => current.concat(update) }),
})

const boundedAttempts = (value: number | undefined) => {
  if (!Number.isSafeInteger(value) || value === undefined) return 2
  return Math.min(3, Math.max(1, value))
}

export function createCOSMissionGraph<TInput, TPlan, TResult>(dependencies: COSMissionGraphDependencies<TInput, TPlan, TResult>) {
  type State = MissionStateValue<TInput, TPlan, TResult>

  const emit = async (event: COSMissionTransition) => {
    await dependencies.onTransition?.(Object.freeze({ ...event }))
  }

  const planNode = RunnableLambda.from(async (rawState: typeof MissionState.State) => {
    const state = rawState as State
    const plan = await dependencies.plan(state.input)
    await emit({ stage: 'plan', attempt: state.attempt })
    return { plan, trace: ['plan'] }
  }).withConfig({ runName: 'cos_plan' })

  const executeNode = RunnableLambda.from(async (rawState: typeof MissionState.State) => {
    const state = rawState as State
    if (state.plan === undefined) throw new Error('COS LangGraph execution requires a plan.')
    const attempt = state.attempt + 1
    const result = await dependencies.execute({ input: state.input, plan: state.plan, attempt })
    await emit({ stage: 'execute', attempt })
    return { result, attempt, verified: false, reason: undefined, trace: [`execute:${attempt}`] }
  }).withConfig({ runName: 'cos_execute' })

  const verifyNode = RunnableLambda.from(async (rawState: typeof MissionState.State) => {
    const state = rawState as State
    if (state.plan === undefined || state.result === undefined) throw new Error('COS LangGraph verification requires plan and result evidence.')
    const verification = await dependencies.verify({ input: state.input, plan: state.plan, result: state.result, attempt: state.attempt })
    await emit({ stage: 'verify', attempt: state.attempt, verified: verification.ok, reason: verification.reason })
    return {
      verified: verification.ok,
      reason: verification.reason,
      trace: [`verify:${state.attempt}:${verification.ok ? 'pass' : 'fail'}`],
    }
  }).withConfig({ runName: 'cos_verify' })

  const repairNode = RunnableLambda.from(async (rawState: typeof MissionState.State) => {
    const state = rawState as State
    if (!dependencies.repair || state.plan === undefined || state.result === undefined) return { trace: ['repair:unavailable'] }
    const plan = await dependencies.repair({ input: state.input, plan: state.plan, result: state.result, attempt: state.attempt, reason: state.reason })
    await emit({ stage: 'repair', attempt: state.attempt, reason: state.reason })
    return { plan, reason: undefined, trace: [`repair:${state.attempt}`] }
  }).withConfig({ runName: 'cos_repair' })

  const routeAfterVerification = (rawState: typeof MissionState.State): 'retry' | 'done' => {
    const state = rawState as State
    if (state.verified) return 'done'
    if (!dependencies.repair) return 'done'
    return state.attempt < state.maxAttempts ? 'retry' : 'done'
  }

  return new StateGraph(MissionState)
    .addNode('plan_step', planNode)
    .addNode('execute_step', executeNode)
    .addNode('verify_step', verifyNode)
    .addNode('repair_step', repairNode)
    .addEdge(START, 'plan_step')
    .addEdge('plan_step', 'execute_step')
    .addEdge('execute_step', 'verify_step')
    .addConditionalEdges('verify_step', routeAfterVerification, { retry: 'repair_step', done: END })
    .addEdge('repair_step', 'execute_step')
    .compile()
}

export async function runCOSMissionGraph<TInput, TPlan, TResult>(
  input: TInput,
  dependencies: COSMissionGraphDependencies<TInput, TPlan, TResult>,
  options: { maxAttempts?: number; recursionLimit?: number } = {},
): Promise<COSMissionGraphResult<TPlan, TResult>> {
  const graph = createCOSMissionGraph(dependencies)
  const maxAttempts = boundedAttempts(options.maxAttempts)
  const finalState = await graph.invoke(
    { input, attempt: 0, maxAttempts, verified: false, trace: [] },
    { recursionLimit: Math.max(8, Math.min(24, options.recursionLimit ?? 16)) },
  ) as MissionStateValue<TInput, TPlan, TResult>

  if (finalState.plan === undefined || finalState.result === undefined) {
    throw new Error('COS LangGraph mission ended without plan/result evidence.')
  }

  return Object.freeze({
    status: finalState.verified ? 'verified' : 'unverified',
    plan: finalState.plan,
    result: finalState.result,
    attempts: finalState.attempt,
    reason: finalState.reason,
    trace: Object.freeze([...finalState.trace]) as unknown as string[],
  })
}
