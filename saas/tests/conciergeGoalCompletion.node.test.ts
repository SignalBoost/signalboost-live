import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  blockedGoal,
  completedGoal,
  mayAutomaticallyRetryGoal,
  partialGoal,
} from '../lib/ai/cos/goalCompletion.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('COS goal completion contract distinguishes done, partial and blocked objectives', () => {
  assert.deepEqual(completedGoal(['tool_succeeded', 'tool_succeeded']), {
    status: 'done',
    evidence: ['tool_succeeded'],
    unresolved: [],
    recommended_next_action: 'deliver',
  })

  assert.deepEqual(partialGoal(['job_queued'], ['proof_pending'], 'wait', { attempts: 1 }), {
    status: 'partial',
    evidence: ['job_queued'],
    unresolved: ['proof_pending'],
    recommended_next_action: 'wait',
    attempts: 1,
  })

  assert.deepEqual(blockedGoal(['safe_recovery_exhausted'], ['reference:Example Person'], 'ask_user', { attempts: 3 }), {
    status: 'blocked',
    evidence: ['safe_recovery_exhausted'],
    unresolved: ['reference:Example Person'],
    recommended_next_action: 'ask_user',
    attempts: 3,
  })
})

test('automatic goal retry cannot replay metered or consequential actions', () => {
  assert.equal(mayAutomaticallyRetryGoal('read_only'), true)
  assert.equal(mayAutomaticallyRetryGoal('idempotent'), true)
  assert.equal(mayAutomaticallyRetryGoal('metered'), false)
  assert.equal(mayAutomaticallyRetryGoal('consequential'), false)
})

test('named-person visual recovery tries bounded read-only searches without relaxing identity checks', () => {
  const source = read('../lib/visuals/personReferences.ts')

  assert.match(source, /COMMONS_SEARCH_STRATEGIES/)
  assert.match(source, /commons-official-portrait/)
  assert.match(source, /commons-portrait/)
  assert.match(source, /commons-name/)
  assert.match(source, /Promise\.all\(searchStrategies\.map/)
  assert.match(source, /queryTokens\.every\(\(token\) => titleText\.includes\(token\)\)/)
  assert.match(source, /if \(!portraitSignals\) continue/)
  assert.match(source, /recovery never substitutes a different identity/i)
})

test('legacy person-reference callers receive the recovered verified reference', () => {
  const source = read('../lib/visuals/personReferences.ts')
  assert.match(source, /export async function resolveVerifiedPersonReferenceWithRecovery/)
  assert.match(source, /return \(await resolveVerifiedPersonReferenceWithRecovery\(referenceQuery\)\)\.reference/)
})

test('Concierge visual execution reports completion and asks only after safe reference recovery is exhausted', () => {
  const route = read('../app/api/visuals/route.ts')

  assert.match(route, /resolveVerifiedPersonReferenceWithRecovery/)
  assert.match(route, /verified_reference_search_exhausted/)
  assert.match(route, /unresolved_people: unresolvedPeople/)
  assert.match(route, /goal_completion: blockedGoal/)
  assert.match(route, /goal_completion: completedGoal/)
  assert.match(route, /goal_completion: partialGoal/)
  assert.match(route, /reference_lookup_attempts/)
  assert.match(route, /I tried the available verified-reference searches/)
})
