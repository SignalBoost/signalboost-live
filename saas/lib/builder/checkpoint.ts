import { createHash } from 'node:crypto'
import type { BuilderFile, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import type { BuilderProjectContext } from './project-context.ts'

/** Private controller state, never a client-provided continuation or model reasoning transcript. */
export type BuilderLoopCheckpoint = Readonly<{
  version: 1
  workspaceId: string
  objectiveDigest: string
  workspaceDigest: string
  trace: readonly BuilderToolTrace[]
  workingFiles: readonly BuilderFile[]
  initialPaths: readonly string[]
  projectContext: BuilderProjectContext
  inspections: readonly string[]
  mutations: readonly string[]
  runs: readonly string[]
  repairObjective: boolean
  writeCount: number
  runCount: number
  gateNudges: number
  workRounds: number
  pendingWrite?: import('./chunked-write.ts').PendingBuilderWrite | null
  attempt: number
}>

export function checkpointDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function workspaceDigest(workspace: BuilderWorkspacePort, workspaceId: string): Promise<string> {
  const listing = await workspace.listFiles(workspaceId)
  const files = await Promise.all([...listing].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map(async file => {
      const current = await workspace.readFile(workspaceId, file.path)
      if (!current) throw new Error('builder_checkpoint_workspace_changed')
      return [file.path, current.content]
    }))
  return checkpointDigest(JSON.stringify(files))
}
