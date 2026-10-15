import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const api = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../lib/builder/workspace-supabase.ts', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')

test('explicit saved-workspace requests fail before enqueue if no source and no repository', () => {
  const gate = api.indexOf('if (!newProjectRequested && (project.workspaceId || requestedWorkspaceId)')
  const enqueue = api.indexOf('await enqueueBuilderJob(')
  assert.ok(gate > 0 && enqueue > gate)
  assert.match(api, /!hasWorkspaceSource\(existingFiles\.map\(file => file\.path\)\) && !repositoryTarget/)
  assert.match(api, /Selected workspace is empty\. Choose the original project or connect\/import the repository\./)
  assert.match(api, /status: 422/)
})

test('repository target keeps existing import path and new projects are excluded from saved-workspace check', () => {
  assert.match(api, /if \(repositoryTarget\) \{[\s\S]*?await importBuilderRepository\(repositoryTarget\)/)
  assert.match(api, /if \(!newProjectRequested && \(project\.workspaceId \|\| requestedWorkspaceId\)/)
})

test('workspace picker exposes source counts and disables empty saved workspaces', () => {
  assert.match(workspace, /count: 'exact', head: true/)
  assert.match(workspace, /fileCount: count \?\? 0/)
  assert.match(ui, /fileCount: number/)
  assert.match(ui, /workspace\.fileCount === 0/)
  assert.match(ui, /files\{workspace\.fileCount === 0 \? ' \(empty\)'/)
})
