import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stableKnowledgeQuestionNeedsNoPlanner } from '../lib/ai/cos/cosAgentDecision.ts'

const PREVIOUS = 'In Kubernetes, a Job creates one or more Pods to complete a task. A CronJob schedules Jobs to run periodically.'

test('a self-contained second question skips the capability planner', () => {
  // Production 2026-09-30 05:32 UTC: "assistant:planner 20.4 s" only because a previous answer existed.
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('What is the difference between an Ingress and a Service in Kubernetes?', PREVIOUS), true)
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('How does a StatefulSet keep stable network identities?', PREVIOUS), true)
})

test('a follow-up that points back at the previous answer still gets the planner', () => {
  for (const followUp of [
    'Why does it need a cron expression?',
    'What about those Pods, how are they cleaned up?',
    'Explain that again with an example',
    'What else should I know?',
    'How does the above compare to Argo Workflows?',
  ]) assert.equal(stableKnowledgeQuestionNeedsNoPlanner(followUp, PREVIOUS), false, followUp)
  // Mutable/current and action language keeps the planner with or without history.
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('What is the latest Kubernetes release?', PREVIOUS), false)
  assert.equal(stableKnowledgeQuestionNeedsNoPlanner('What is the weather in Warsaw today?'), false)
})

test('the planner never goes RunPod-first or holds the RunPod slot', () => {
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const eligible = source.slice(source.indexOf('function interactiveRunpodFirstEligible('), source.indexOf('function interactiveManagedBackupAfterMs('))
  assert.match(eligible, /if \(args\.tools\?\.length\) return false/)
  assert.match(eligible, /=== 'agent_native_tool_choice'\) return false/)
  const decision = readFileSync(new URL('../lib/ai/cos/cosAgentDecision.ts', import.meta.url), 'utf8')
  assert.match(decision, /purpose: 'agent_native_tool_choice'/)
  assert.match(decision, /\n\s+tools,\n/)
})