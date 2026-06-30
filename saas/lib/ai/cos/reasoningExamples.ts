// saas/lib/ai/cos/reasoningExamples.ts
// Run with `npx tsx saas/lib/ai/cos/reasoningExamples.ts` to verify v1 behavior.
import { runCosReasoning } from './reasoningCore';

const objectives = [
  'make a video about our audit features',
  'find hotels to partner with',
  'update DNS records',
  'how many affiliates are shown on signalboostapp.com',
  'how many users do we have',
  '',
];

for (const o of objectives) {
  const r = runCosReasoning(o);
  console.log('—'.repeat(60));
  console.log('OBJECTIVE:', JSON.stringify(o));
  console.log('ok:', r.ok, '| channel:', r.decision.channel, '| state:', r.executionPlan.state);
  console.log('source:', r.sourceRouting.requiredSource, '| mustUseTool:', r.sourceRouting.mustUseTool);
  console.log('prepareNow:', r.executionPlan.shouldPrepareNow, '| executeNow:', r.executionPlan.shouldExecuteNow, '| approval:', r.executionPlan.requiredApproval);
}
