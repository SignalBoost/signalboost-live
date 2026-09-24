import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_DISTILLED_CANARY_MAX_COST_USD,
  MASS_DISTILLED_CANARY_POOL_PRICE_CEILING_USD_PER_HOUR,
  massDistilledCanaryWorstCaseCostUsd,
  selectMassDistilledCanaryPools,
} from '../lib/ai/cos/runpodMassDistilledProvisionV2.ts'

const provisionV2 = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
const gpu = (pool: string, price: number, memory = 24, availability = 'High') =>
  ({ pool, manufacturer: 'NVIDIA', memory, availability, price: { serverless: price } })

test('ADA_24 is a third, ordered canary fallback after both Ampere pools', () => {
  assert.match(provisionV2, /const CANARY_APPROVED_POOLS = \['AMPERE_24', 'AMPERE_16', 'ADA_24'\] as const/)
  const pools = selectMassDistilledCanaryPools([gpu('ADA_24', 1.10), gpu('AMPERE_16', 0.58, 16), gpu('AMPERE_24', 0.69)])
  assert.deepEqual(pools, ['AMPERE_24', 'AMPERE_16', 'ADA_24'])
})

test('the independent evaluator stays AMPERE_24-only', () => {
  assert.match(provisionV2, /const APPROVED_POOLS = \['AMPERE_24'\] as const/)
  assert.match(provisionV2, /constrainEndpointToApprovedGpu\(clean\(endpointId, 160\), '', IDLE_TIMEOUT_SECONDS, APPROVED_POOLS\)/)
})

test('every pool has an explicit hourly ceiling and ADA_24 is exactly $1.10/hr', () => {
  assert.deepEqual({ ...MASS_DISTILLED_CANARY_POOL_PRICE_CEILING_USD_PER_HOUR }, { AMPERE_24: 0.69, AMPERE_16: 0.69, ADA_24: 1.10 })
})

test('every ceiling keeps the worst-case canary inside the unchanged $0.20 authorization', () => {
  assert.equal(MASS_DISTILLED_CANARY_MAX_COST_USD, 0.2)
  for (const ceiling of Object.values(MASS_DISTILLED_CANARY_POOL_PRICE_CEILING_USD_PER_HOUR)) {
    assert.ok(massDistilledCanaryWorstCaseCostUsd(ceiling) <= MASS_DISTILLED_CANARY_MAX_COST_USD, `ceiling ${ceiling}`)
  }
})

test('a pool priced above its live ceiling is refused, whichever pool it is', () => {
  assert.deepEqual(selectMassDistilledCanaryPools([gpu('AMPERE_24', 0.69), gpu('ADA_24', 1.25)]), ['AMPERE_24'])
  assert.deepEqual(selectMassDistilledCanaryPools([gpu('AMPERE_24', 0.95), gpu('ADA_24', 1.10)]), ['ADA_24'])
})

test('unavailable, unpriced, non-NVIDIA or oversized GPUs never admit a pool', () => {
  assert.deepEqual(selectMassDistilledCanaryPools([
    gpu('AMPERE_24', 0.69, 24, 'None'),
    { pool: 'AMPERE_16', manufacturer: 'NVIDIA', memory: 16, availability: 'High', price: { serverless: null } },
    { ...gpu('ADA_24', 1.10), manufacturer: 'AMD' },
  ]), [])
  assert.deepEqual(selectMassDistilledCanaryPools([gpu('ADA_24', 1.10, 48)]), [])
})

test('an unreadable catalog never enables ADA_24 and keeps the previously approved Ampere pools', () => {
  assert.deepEqual(selectMassDistilledCanaryPools(null), ['AMPERE_24', 'AMPERE_16'])
  assert.deepEqual(selectMassDistilledCanaryPools(undefined), ['AMPERE_24', 'AMPERE_16'])
})

test('the live canary provisions only catalog-approved pools and fails closed when none qualify', () => {
  assert.match(provisionV2, /requestV2<\{ gpus\?: CatalogGpu\[\] \}>\('\/catalog\/gpus'\)/)
  assert.match(provisionV2, /const pools = selectMassDistilledCanaryPools\(catalogGpus\)/)
  assert.match(provisionV2, /if \(!pools\.length\) throw new Error\('mass_distilled_runtime_gpu_capacity_unavailable'\)/)
  assert.match(provisionV2, /return provisionMassDistilledRuntimeWithPools\(input, pools\)/)
})
