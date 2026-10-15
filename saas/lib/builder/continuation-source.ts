import { hasWorkspaceSource } from './repository-repair-target.ts'

export type ExistingSourceInspection =
  | { status: 'ready'; paths: string[] }
  | { status: 'workspace_missing' | 'source_missing' | 'read_unavailable'; paths: [] }

/** Only inspect an existing, caller-owned workspace. Never manufacture source. */
export async function inspectBuilderContinuationSource(input: {
  hasWorkspace: () => Promise<boolean>
  listPaths: () => Promise<string[]>
  wait?: (milliseconds: number) => Promise<void>
}): Promise<ExistingSourceInspection> {
  const wait = input.wait || ((milliseconds: number) =>
    new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
  let last: 'source_missing' | 'read_unavailable' = 'source_missing'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!await input.hasWorkspace()) return { status: 'workspace_missing', paths: [] }
      const paths = await input.listPaths()
      if (hasWorkspaceSource(paths)) return { status: 'ready', paths }
      last = 'source_missing'
    } catch {
      last = 'read_unavailable'
    }
    if (attempt < 2) await wait(350 * (attempt + 1))
  }
  return { status: last, paths: [] }
}
