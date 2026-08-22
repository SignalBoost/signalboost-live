import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const proxy = readFileSync('proxy.ts', 'utf8')
const assistantRoute = readFileSync('app/api/assistant/route.ts', 'utf8')
const assistantPage = readFileSync('app/dashboard/assistant/page.tsx', 'utf8')
const conciergeRoute = readFileSync('app/api/concierge/route.ts', 'utf8')

test('public Concierge and private Chief of Staff are distinct server pipelines', () => {
  assert.match(proxy, /ASSISTANT_DASHBOARD_PATH\s*=\s*['"]\/dashboard\/assistant['"]/)
  assert.match(proxy, /pathname === ['"]\/api\/concierge['"].*requestCameFromAssistantDashboard\(req\)/s)
  assert.match(proxy, /chiefOfStaffUrl\.pathname = ['"]\/api\/assistant['"]/)
  assert.doesNotMatch(proxy, /cosBrowserUrl\.pathname = ['"]\/api\/cos-browser['"]/)
  assert.match(conciergeRoute, /export async function POST\(req: NextRequest\)/)
})

test('Chief of Staff ingress is owner-only and delegates to COS Primary', () => {
  assert.match(assistantRoute, /POST as cosPrimaryPost.*api\/cos-primary\/route/)
  assert.match(assistantRoute, /if \(!access\.isOwner\).*owner-only/s)
  assert.match(assistantRoute, /assistantSurface:\s*['"]chief_of_staff['"]/)
  assert.match(assistantRoute, /ownerMode:\s*true/)
  assert.match(assistantRoute, /x-signalboost-assistant-surface['"], ['"]chief-of-staff['"]/)
})

test('Chief of Staff owns transcript persistence so feedback cannot race history', () => {
  assert.match(assistantRoute, /delete context\.conversationId/)
  assert.match(assistantRoute, /await persistTurn\(\{/)
  assert.match(assistantRoute, /userMessage:\s*prompt/)
  assert.match(assistantRoute, /assistantReply:\s*reply/)
  assert.match(assistantRoute, /return response/)
})

test('legacy dashboard transport remains compatible while the proxy separates it from Concierge', () => {
  assert.match(assistantPage, /fetch\(['"]\/api\/concierge['"]/)
  assert.match(assistantPage, /currentPage:\s*['"]\/dashboard\/assistant['"]/)
})
