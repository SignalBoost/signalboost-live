import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

test('canonical Audit lifecycle preserves truthful renderer and discovers automatic remediation', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')

  assert.match(lifecycle, /activityCheckedAt\?: string/)
  assert.match(lifecycle, /function stageProgress/)
  assert.match(lifecycle, /status === 'checks_failed'/)
  assert.match(lifecycle, /role="progressbar"/)
  assert.match(lifecycle, /AUTO_STATUS = new Set\(\['approved', 'remediated'\]\)/)
  assert.match(lifecycle, /fetch\('\/api\/hub\/operator\/audit\/runs'/)
  assert.match(lifecycle, /runId=\$\{encodeURIComponent\(latest\.id\)\}/)
  assert.match(lifecycle, /detail\.remediation/)
  assert.match(lifecycle, /data-audit-automatic-remediation/)
})

test('automatic Audit UI only hides the obsolete approval controls with durable remediation state', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')

  assert.match(lifecycle, /AUTO_RECENT_MS = 10 \* 60 \* 1000/)
  assert.match(lifecycle, /AUTO_POLL_MS = 10_000/)
  assert.match(lifecycle, /Number\(run\.findings_count \|\| 0\) === Math\.max\(0, Number\(findingsApproved \|\| 0\)\)/)
  assert.match(lifecycle, /const state = suppliedState \|\| autoState/)
  assert.match(lifecycle, /const hideManualControls = Boolean\(state\)/)
  assert.match(lifecycle, /manualControls\.style\.display = 'none'/)
  assert.match(lifecycle, /Absence of durable status evidence never manufactures a success state/)
})
