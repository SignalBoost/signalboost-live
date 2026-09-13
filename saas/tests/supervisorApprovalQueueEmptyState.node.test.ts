// saas/tests/supervisorApprovalQueueEmptyState.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

test('empty Supervisor approval queue explains why no approve button appears', () => {
  const page = readFileSync(resolve(root, 'app/dashboard/supervisor/approvals/page.tsx'), 'utf8')
  const copy = readFileSync(resolve(root, 'lib/i18n/approvalsEmptyCopy.ts'), 'utf8')

  assert.match(page, /const hasItems=items\.length>0/)
  assert.match(page, /hasItems\?<p style=\{muted\}>\{t\.pendingApproval\}<\/p>:/)
  assert.match(page, /ae\.noButtonNote/)
  assert.match(copy, /No approval required/)
  assert.match(copy, /There is no approval button because there is no real pending approval item\./)
})
