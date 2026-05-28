export type WikiContentItem = {
  title:       string
  description: string | null
  image_url:   string | null
  wiki_url:    string
}

export type OperatorPlan = {
  id: string
  request: string
  clarificationQuestion?: string
  summary: string
  steps: string[]
  fileTargets: string[]
  preview: string[]
  requiresApproval: boolean
  createdAt: string
  contentData?: WikiContentItem[]
  contentQuery?: string
}

export type OperatorJob = {
  id: string
  planId: string
  state: 'queued' | 'applying' | 'committed' | 'deploying' | 'published' | 'failed' | 'rolled_back'
  commitMessage: string
  publishMessage: string
  rollbackAvailable: boolean
  createdAt: string
  updatedAt: string
  error?: string
  videoRequestId?: string
  videoModel?: string
  videoUrl?: string
  videoStatus?: 'rendering' | 'done' | 'failed'
}

type OperatorStore = {
  plans: Map<string, OperatorPlan>
  jobs:  Map<string, OperatorJob>
}

const g = globalThis as unknown as { __sbOperatorStore?: OperatorStore }
if (!g.__sbOperatorStore) {
  g.__sbOperatorStore = {
    plans: new Map(),
    jobs:  new Map(),
  }
}

export const operatorStore = g.__sbOperatorStore

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
