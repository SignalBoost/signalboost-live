import test from 'node:test'
import assert from 'node:assert/strict'
import { findBadImports } from '../lib/ai/tools/repoWriter.ts'

const paths = new Set([
  'lib/admin/governance.ts',
  'lib/i18n/useTranslation.ts',
  'saas/lib/audit/reportModel.ts',
  'saas/components/audit/PatchPreview.tsx',
])
const deps = new Set<string>()

test('root-app @ aliases resolve from the repository root', () => {
  const content = [
    "import { governanceSummary } from '@/lib/admin/governance'",
    "import { useTranslation } from '@/lib/i18n/useTranslation'",
  ].join('\n')

  assert.deepEqual(findBadImports(content, 'app/admin/governance/page.tsx', paths, deps), [])
})

test('saas @ aliases continue to resolve from the saas workspace', () => {
  const content = [
    "import { resolveFinding } from '@/lib/audit/reportModel'",
    "import PatchPreview from '@/components/audit/PatchPreview'",
  ].join('\n')

  assert.deepEqual(findBadImports(content, 'saas/app/dashboard/audit/page.tsx', paths, deps), [])
})

test('workspace-aware resolution still rejects invented imports', () => {
  const rootBad = findBadImports(
    "import { missing } from '@/lib/admin/not-real'",
    'app/admin/governance/page.tsx',
    paths,
    deps,
  )
  const saasBad = findBadImports(
    "import { missing } from '@/lib/audit/not-real'",
    'saas/app/dashboard/audit/page.tsx',
    paths,
    deps,
  )

  assert.deepEqual(rootBad, ['@/lib/admin/not-real'])
  assert.deepEqual(saasBad, ['@/lib/audit/not-real'])
})
