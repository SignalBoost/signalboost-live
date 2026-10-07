// saas/tests/massEvaluationBaselineAbstention.node.test.ts
//
// Production 2026-10-04 (19:09-20:30 UTC): 13 of 14 evaluation failures in two hours were the BASELINE model producing
// no answer for the same four cases, tick after tick, each a paid wake, the student never examined. The base model
// abstaining is a fact about the base model: that case now scores baseline = 0 by rule, is recorded as
// baseline_abstained:<id>:<fingerprint>, and the student is judged on it normally.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

/** The two deterministic no-answer shapes, read from the module's own predicates so the test cannot drift from them. */
const regexOf = (name: string): RegExp => {
  const match = new RegExp(`function ${name}\\(error:string\\)\\{\\s*return (\\/.*?\\/)\\.test\\(error\\)`).exec(SOURCE)
  assert.ok(match, `${name} predicate found`)
  return new RegExp(match![1].slice(1, -1))
}

// The exact strings from Production, as the owner pasted them.
const MARKERLESS = 'mass_distilled_evaluation_answer_missing:0ed47596334707bd:finish=stop:think=0:open=0:close=0:other=0:cap=1024'
const EMPTY = 'mass_distilled_evaluation_answer_empty:3a421568063d32b4:finish=stop:think=0:open=1:close=1:other=0:cap=1024'
const TRUNCATED = 'mass_distilled_evaluation_answer_missing:0ee6ecdba3940d76:finish=length:think=0:open=1:close=0:other=0:cap=1024'

test('the Production fingerprints are exactly the two deterministic normal-stop shapes; truncation is not one of them', () => {
  const markerless = regexOf('candidateSoloMarkerlessNoAnswer')
  const empty = regexOf('candidateSoloEmptyAnswer')
  assert.equal(markerless.test(MARKERLESS), true)
  assert.equal(empty.test(EMPTY), true)
  assert.equal(markerless.test(TRUNCATED) || empty.test(TRUNCATED), false, 'a truncated answer stays retryable infrastructure')
  assert.equal(markerless.test(EMPTY) || empty.test(MARKERLESS), false)
})

test('the baseline abstains on exactly those two shapes, after the solo retry, and the candidate path is untouched', () => {
  // Candidate rules first, unchanged: the student's own no-answer is still a merit failure.
  assert.match(SOURCE, /if\(input\.candidate&&candidateSoloOutputExhaustion\(failure\)\)throw new Error/)
  assert.match(SOURCE, /if\(input\.candidate&&candidateSoloEmptyAnswer\(failure\)\)throw new Error/)
  assert.match(SOURCE, /if\(input\.candidate&&candidateSoloMarkerlessNoAnswer\(failure\)\)throw new Error/)
  // Then the baseline rule: record and continue, never throw, only for those two shapes.
  assert.match(SOURCE, /if\(!input\.candidate&&\(candidateSoloEmptyAnswer\(failure\)\|\|candidateSoloMarkerlessNoAnswer\(failure\)\)\)\{abstained\.set\(id,failure\);[^}]*continue\}/)
  // Any other baseline failure still fails closed.
  assert.match(SOURCE, /continue\}\s*\/\/[^\n]*\n\s*throw new MassEvaluationAnswerProtocolError\(failure,solo\.protocol\[id\]\)\s*\}/)
  // It happens inside the solo retry, so a first grouped miss still earns its one solo attempt.
  const soloAt = SOURCE.indexOf('const solo=await raw([item])')
  const abstainAt = SOURCE.indexOf('abstained.set(id,failure)')
  assert.ok(soloAt > 0 && abstainAt > soloAt)
  // The answer count accepts abstentions, so the suite proceeds with every case accounted for.
  assert.match(SOURCE, /if\(answers\.size\+abstained\.size!==input\.cases\.length\)throw new Error\(`mass_distilled_evaluation_answer_count_invalid/)
  assert.match(SOURCE, /rawExcerpts:Object\.freeze\(excerpts\),abstained\}/)
})

test('an abstained case is scored baseline = 0 BY RULE, never by the judge; the student is judged normally', () => {
  // The judge sees an explicit placeholder (no silent undefined - the 2026-09-19 defect), ...
  assert.match(SOURCE, /const baselineAnswer=abstained\.has\(item\.id\)\?'\[no answer: the baseline model produced no answer for this case\]':input\.baseline\.get\(item\.id\)/)
  // ... and whatever it returns for the baseline on that case is overridden to 0 after parsing.
  assert.match(SOURCE, /baseline:abstained\.has\(id\)\?0:baseline,candidate,candidateSafe:row\.candidate_safe/)
  // A still-missing baseline answer that did NOT abstain is still a named failure.
  assert.match(SOURCE, /throw new Error\(`mass_distilled_evaluation_judge_baseline_answer_missing:\$\{input\.suiteName\}:\$\{item\.id\}`\)/)
  // The candidate's missing answer rule is unchanged.
  assert.match(SOURCE, /throw new Error\(`mass_distilled_evaluation_judge_candidate_answer_missing:\$\{input\.suiteName\}:\$\{item\.id\}`\)/)
})

test('abstentions are recorded on the suite result and the run row, with the fingerprint, under one prefix', () => {
  assert.match(SOURCE, /export const BASELINE_ABSTAINED_PREFIX = 'baseline_abstained:' as const/)
  assert.match(SOURCE, /baselineAbstained=Object\.freeze\(Array\.from\(input\.baseline\.abstained\?\?\[\]\)\.map\(\(\[id,fingerprint\]\)=>`\$\{BASELINE_ABSTAINED_PREFIX\}\$\{id\}:\$\{fingerprint\}`\)\)/)
  assert.match(SOURCE, /baselineAbstained:readonly string\[\];/)
  assert.match(SOURCE, /baselineAbstained:Object\.fromEntries\(\(\[\['holdout',holdout\],\['safety',safety\],\['transfer',transfer\],\['retention',retention\]\] as const\)\.filter\(\(\[,r\]\)=>r\.baselineAbstained\.length\)/)
  // Suite gates are untouched: scores still average every case, the zero-collapse rule still reads the scored cases.
  assert.match(SOURCE, /baselineScore:average\(judged\.scored\.map\(item=>item\.baseline\)\),candidateScore:average\(judged\.scored\.map\(item=>item\.candidate\)\)/)
  assert.match(SOURCE, /const zeroCollapse=judged\.scored\.every\(item=>item\.baseline===0&&item\.candidate===0\)/)
})
// end of saas/tests/massEvaluationBaselineAbstention.node.test.ts (if this line is missing, the paste was cut short)
