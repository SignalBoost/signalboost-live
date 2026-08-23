import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync(new URL('../app/api/cos-primary/baseRoute.ts', import.meta.url), 'utf8')

function strategyRequestPatternFromRoute(): RegExp {
  const line = routeSource.split('\n').find(value => value.includes('const strategyProfileRequest='))
  assert.ok(line, 'strategy-profile generation detector must remain in the COS primary route')
  const match = line.match(/strategyProfileRequest=(\/.*\/[a-z]*)\.test\(input\)/)
  assert.ok(match?.[1], 'strategy-profile generation detector must remain a regex tested against input')
  return Function(`"use strict"; return (${match[1]});`)() as RegExp
}

test('the production failure prompt is routed through current strategy-profile generation', () => {
  const input = 'Generate content using the current strategy profile weights and explain which heuristics influenced the output.'
  assert.equal(strategyRequestPatternFromRoute().test(input), true)
})

test('strategy-profile generation reads current outcomes and cannot reuse a cached refusal', () => {
  assert.match(routeSource, /readStrategyProfile\(/)
  assert.match(routeSource, /appliedStrategyOverrides\(profile\.profile\)/)
  assert.match(routeSource, /disableCache:strategyProfileRequest/)
  assert.match(routeSource, /Generate the requested content/)
  assert.match(routeSource, /supporting campaign IDs/)
  assert.match(routeSource, /do not claim missing configuration/)
})
