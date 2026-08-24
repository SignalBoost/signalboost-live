import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPublicDeliveryScope, withPublicDeliveryScope } from '../lib/auth/publicDeliveryScope.ts'

const conciergeRoute = readFileSync(join(process.cwd(), 'app/api/concierge/route.ts'), 'utf8')
const accessSource = readFileSync(join(process.cwd(), 'lib/auth/access.ts'), 'utf8')
const cosFirstSource = readFileSync(join(process.cwd(), 'lib/ai/cos/cosFirstAnswer.ts'), 'utf8')

function position(source: string, token: string): number {
  const index = source.indexOf(token)
  assert.ok(index >= 0, `expected source to contain ${token}`)
  return index
}

test('public delivery scope is request-local and does not leak outside the callback', async () => {
  assert.equal(isPublicDeliveryScope(), false)
  await withPublicDeliveryScope(async () => {
    assert.equal(isPublicDeliveryScope(), true)
    await Promise.resolve()
    assert.equal(isPublicDeliveryScope(), true)
  })
  assert.equal(isPublicDeliveryScope(), false)
})

test('Concierge enters public-only scope before parsing or dispatching the request', () => {
  const scope = position(conciergeRoute, 'if (!isPublicDeliveryScope())')
  const body = position(conciergeRoute, 'const body = await req.clone().json()')
  const prospect = position(conciergeRoute, 'const prospectCampaign = await directProspectCampaign')
  const primary = position(conciergeRoute, 'const primaryRun = await boundedPrimary(req)')
  assert.ok(scope < body)
  assert.ok(scope < prospect)
  assert.ok(scope < primary)
})

test('public delivery is downgraded before Supabase identity can grant owner privileges', () => {
  const publicGuard = position(accessSource, "if (isPublicDeliveryScope()) return buildContext(null, null, 'guest')")
  const supabase = position(accessSource, 'const supabase = await getServerSupabase()')
  assert.ok(publicGuard < supabase)
})

test('public COS reasoning bypasses Enterprise Memory, KG, learned corpus, and user memory', () => {
  const publicBranch = position(cosFirstSource, 'if (isPublicDeliveryScope())')
  const enterprisePath = position(cosFirstSource, 'if (process.env.COS_LOCAL_FIRST_ENABLED')
  assert.ok(publicBranch < enterprisePath)
  assert.match(cosFirstSource, /enterpriseMemoryStatus: 'not_available_public_delivery'/)
  assert.match(cosFirstSource, /knowledgeFactsUsed: 0/)
  assert.match(cosFirstSource, /learnedItemsUsed: 0/)
  assert.match(cosFirstSource, /enterpriseMemoriesUsed: 0/)
  assert.match(cosFirstSource, /userMemoriesUsed: 0/)
})

test('public COS company knowledge is limited to the public product catalog', () => {
  assert.match(cosFirstSource, /For SignalBoost-specific claims, use ONLY the PUBLIC PRODUCT CATALOG/)
  assert.match(cosFirstSource, /implementation details are not public/)
  assert.match(cosFirstSource, /buildProductCatalogSummary\(\)/)
})
