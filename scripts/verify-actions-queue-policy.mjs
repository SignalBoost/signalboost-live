// scripts/verify-actions-queue-policy.mjs
//
// Prevent CI definitions from reintroducing the duplicate-run patterns that can
// flood GitHub Actions and burn budget: unrestricted feature-branch push runs,
// push+PR workflows without cross-event concurrency collapse, or a backlog
// self-healer tied to a scarce macOS runner.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const workflowDir = join(process.cwd(), '.github', 'workflows')
const files = (await readdir(workflowDir))
  .filter(name => /\.ya?ml$/i.test(name))
  .sort()

function onBlock(text) {
  const lines = text.replace(/\r/g, '').split('\n')
  const start = lines.findIndex(line => /^on:\s*$/.test(line))
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z0-9_-]+:\s*/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start + 1, end).join('\n')
}

function eventSection(block, eventName) {
  const lines = block.split('\n')
  const start = lines.findIndex(line => new RegExp(`^  ${eventName}:\\s*(?:\\{\\})?\\s*$`).test(line))
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

const allowedDualEventWorkflows = new Set([
  // Governance/integrity needs both the proposed PR revision and the landed main revision.
  'audit-remediation-regression.yml',
  'main-write-discipline.yml',
  'pipeline-integrity.yml',
  // These workflows intentionally produce/deploy artifacts across PR and main lifecycle events.
  'portable-package.yml',
  'portable-release.yml',
  'runpod-serverless-embedding.yml',
  'social-outreach-package.yml',
])

const violations = []

for (const file of files) {
  const path = join(workflowDir, file)
  const text = await readFile(path, 'utf8')
  const events = onBlock(text)
  const push = eventSection(events, 'push')
  const pullRequest = eventSection(events, 'pull_request')
  const hasPush = Boolean(push)
  const hasPullRequest = Boolean(pullRequest)
  const pushHasBranchFilter = /^\s{4}branches(?:-ignore)?:/m.test(push)
  const unrestrictedPush = hasPush && !pushHasBranchFilter
  if (unrestrictedPush) {
    violations.push(`${file}: unrestricted push trigger is forbidden; limit push to main/protected branches or use pull_request`)
  }

  if (hasPush && hasPullRequest && !allowedDualEventWorkflows.has(file)) {
    violations.push(`${file}: validation workflows must not run on both push and pull_request; keep PR validation on pull_request and reserve push for approved governance/release lifecycles`)
  }

  if (unrestrictedPush && hasPullRequest) {
    const hasBranchKey = /github\.event\.pull_request\.head\.ref\s*\|\|\s*github\.ref_name/.test(text)
    const cancelsOld = /cancel-in-progress:\s*true/.test(text)
    if (!hasBranchKey || !cancelsOld) {
      violations.push(`${file}: push+pull_request workflow must share a branch-key concurrency group and cancel old runs`)
    }
  }

  if (file === 'actions-backlog-self-heal.yml' && /runs-on:\s*macos-latest/.test(text)) {
    violations.push(`${file}: backlog self-healer must not depend on macos-latest`)
  }
}

if (violations.length) {
  console.error('Actions queue policy violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Actions queue policy OK across ${files.length} workflows`)
