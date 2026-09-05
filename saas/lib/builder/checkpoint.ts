import { createHash } from 'node:crypto'
import type { BuilderFile, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import type { BuilderProjectContext } from './project-context.ts'

/** Private controller state, never a client-provided continuation or model reasoning transcript. */
export type BuilderLoopCheckpoint = Readonly<{
  chunks?: readonly [string, string][]
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

export async function validateBuilderCheckpoint(value: BuilderLoopCheckpoint, workspace: BuilderWorkspacePort, workspaceId: string, objective: string): Promise<void> {
  if (value.version !== 1 || value.workspaceId !== workspaceId || value.objectiveDigest !== checkpointDigest(objective)) throw new Error('builder_checkpoint_scope_mismatch')
  if (value.workspaceDigest !== await workspaceDigest(workspace, workspaceId)) throw new Error('builder_checkpoint_workspace_changed')
  if ([value.writeCount, value.runCount, value.workRounds, value.attempt, value.gateNudges]
    .some(count => !Number.isSafeInteger(count) || count < 0 || count > 200)
    || !Array.isArray(value.trace) || value.trace.length > 200
    || Buffer.byteLength(JSON.stringify(value)) > 4_000_000) throw new Error('builder_checkpoint_invalid')
}
