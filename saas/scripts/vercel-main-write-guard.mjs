import { spawnSync } from 'node:child_process'

// Vercel ignoreCommand contract:
//   exit 0 => ignore/skip this deployment
//   exit 1 => continue building
// Preview/task branches always build. Production/main builds continue only when the local Git
// evidence shows a normal GitHub PR merge commit that advanced the shared serialization token.

const branch = String(process.env.VERCEL_GIT_COMMIT_REF || '').trim()
if (branch !== 'main') process.exit(1)

function git(args) {
  return spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function skip(reason) {
  console.error(`[main-write-guard] skipping main deployment: ${reason}`)
  process.exit(0)
}

const ancestry = git(['rev-list', '--parents', '-n', '1', 'HEAD'])
if (ancestry.status !== 0) skip('commit ancestry could not be verified')

const fields = String(ancestry.stdout || '').trim().split(/\s+/).filter(Boolean)
const parents = fields.slice(1)
if (parents.length !== 2) {
  skip('main head is not a two-parent PR merge commit')
}

const message = git(['log', '-1', '--pretty=%B', 'HEAD'])
if (message.status !== 0) skip('merge provenance message could not be read')
if (!/^Merge pull request #\d+ from /m.test(String(message.stdout || ''))) {
  skip('main head is not a standard GitHub pull-request merge')
}

const firstParent = parents[0]
const tokenDiff = git(['diff', '--quiet', firstParent, 'HEAD', '--', '.github/main-write-token'])
if (tokenDiff.status === 0) skip('serialized main integration token did not advance')
if (tokenDiff.status !== 1) skip('serialized main integration token diff could not be verified')

console.log('[main-write-guard] verified serialized PR merge; continuing deployment')
process.exit(1)
