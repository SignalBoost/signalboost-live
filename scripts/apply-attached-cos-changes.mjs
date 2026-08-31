import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const files = {
  route: 'saas/app/api/cos-primary/route.ts',
  authority: 'saas/lib/ai/cos/cosFreshAuthority.ts',
  grounding: 'saas/lib/ai/cos/cosFreshGrounding.ts',
  firstAnswer: 'saas/lib/ai/cos/cosFirstAnswer.ts',
}

const expected = {
  before: {
    route: 'a978376037b4da0b1f2557757164762881071cf1',
    firstAnswer: '502a5ded0d8ebfd0555190257c838581db5a744e',
  },
  after: {
    route: '29d8404eb6ffe48eb3548e3c50464e257b109a20',
    authority: '0888f29ec500c1c7d64986dc73a524dce256a7f1',
    grounding: '1efb0d985a404a8b838f8843fbcceaef88bcf696',
    firstAnswer: '7282f5b447b7bdb7ca3fee510b201f6dd5c088a6',
  },
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertSha(path, sha, stage) {
  const actual = gitBlobSha(read(path))
  if (actual !== sha) throw new Error(`${stage}: ${path} expected ${sha}, got ${actual}`)
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before)
  if (first < 0) throw new Error(`${label}: target text not found`)
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: target text is not unique`)
  return `${text.slice(0, first)}${after}${text.slice(first + before.length)}`
}

assertSha(files.route, expected.before.route, 'preflight')
assertSha(files.firstAnswer, expected.before.firstAnswer, 'preflight')
assertSha(files.authority, expected.after.authority, 'preflight')
assertSha(files.grounding, expected.after.grounding, 'preflight')

let route = read(files.route)
route = replaceOnce(
  route,
  "import { freshEvidenceMeetsQuestionAuthority } from '@/lib/ai/cos/cosFreshAuthority'\n",
  "import { freshEvidenceMeetsQuestionAuthority } from '@/lib/ai/cos/cosFreshAuthority'\nimport { mustFailClosedWithoutAuthoritativeLiveEvidence } from '@/lib/ai/cos/liveEvidenceFailClosed'\n",
  'route import',
)
route = replaceOnce(
  route,
  '  let freshLocalFailureCode: FreshEvidenceInternalFailureCode | null = null\n',
  '  let freshLocalFailureCode: FreshEvidenceInternalFailureCode | null = null\n  let freshMissUseLocal=false\n',
  'route fallback state',
)
route = replaceOnce(
  route,
  'freshSources=prepareFreshEvidenceAcrossQueries(liveResults.filter(live=>live.ok).map(live=>live.results),8)',
  'freshSources=prepareFreshEvidenceAcrossQueries(liveResults.filter(live=>live.ok).map(live=>live.results),8,lookupInput)',
  'route query-aware evidence selection',
)
route = replaceOnce(
  route,
  `    if(!authoritySatisfied){
      const detail=freshError||'Live search did not return authoritative evidence required for this current fact.'
      const executionProvenance=attachFreshEvidenceProvenance(authoritativeProvenance(null,{invoked:false}),{sources:freshSources,retrievedAt:freshRetrievedAt,error:detail,synthesisAccepted:false})
      ;Object.assign(executionProvenance as any, {policy:'fresh_live_data_local_first', assistant_text_used_for_resolution:false})
      const reply=freshEvidenceUnavailableReply(language,lookupInput),liveTelemetry=emitRequestTelemetry({startedAt,input,reply,source:'failed_closed',confidence:0,externalAiInvoked:false})
      await writeCosPrimaryProvenance(userId,reply,executionProvenance,'cos-fresh-evidence-unavailable',{prompt:lookupInput,answered:false,confidence:0,branch:'fresh_evidence_unavailable'})
      return NextResponse.json({ok:false,reply,error:reply,source:'cos-fresh-evidence-unavailable',confidence_score:0,confidence_threshold:confidenceThreshold(),escalation_reason_code:'insufficient_live_authority',fresh_failure_class:'insufficient_live_authority',external_ai_invoked:false,external_fallback_invoked:false,local_model_invoked:false,execution_provenance:executionProvenance,live_evidence_retrieved_this_turn:true,live_evidence_sources:freshSources.map(source=>({id:source.id,title:source.title,url:source.url})),live_telemetry:liveTelemetry,execution_allowed:false,external_action_taken:false},{status:200})
    }
`,
  `    if(!authoritySatisfied){
      if(!freshSources.length && !mustFailClosedWithoutAuthoritativeLiveEvidence(lookupInput)){
        freshMissUseLocal=true
      } else {
      const detail=freshError||'Live search did not return authoritative evidence required for this current fact.'
      const executionProvenance=attachFreshEvidenceProvenance(authoritativeProvenance(null,{invoked:false}),{sources:freshSources,retrievedAt:freshRetrievedAt,error:detail,synthesisAccepted:false})
      ;Object.assign(executionProvenance as any, {policy:'fresh_live_data_local_first', assistant_text_used_for_resolution:false})
      const reply=freshEvidenceUnavailableReply(language,lookupInput),liveTelemetry=emitRequestTelemetry({startedAt,input,reply,source:'failed_closed',confidence:0,externalAiInvoked:false})
      await writeCosPrimaryProvenance(userId,reply,executionProvenance,'cos-fresh-evidence-unavailable',{prompt:lookupInput,answered:false,confidence:0,branch:'fresh_evidence_unavailable'})
      return NextResponse.json({ok:false,reply,error:reply,source:'cos-fresh-evidence-unavailable',confidence_score:0,confidence_threshold:confidenceThreshold(),escalation_reason_code:'insufficient_live_authority',fresh_failure_class:'insufficient_live_authority',external_ai_invoked:false,external_fallback_invoked:false,local_model_invoked:false,execution_provenance:executionProvenance,live_evidence_retrieved_this_turn:true,live_evidence_sources:freshSources.map(source=>({id:source.id,title:source.title,url:source.url})),live_telemetry:liveTelemetry,execution_allowed:false,external_action_taken:false},{status:200})
      }
    }
    if(!freshMissUseLocal){
`,
  'route stable live-miss fallback',
)
route = replaceOnce(
  route,
  "      logEscalation({event:'fresh_local_synthesis_declined',failure_code:freshLocalFailureCode,documents_acquired:freshSources.length,external_ai_invoked:false,local_model_invoked:true,assistant_text_used_for_resolution:false,fresh_context_used:freshConversationContext.contextUsed})\n    }\n  }\n",
  "      logEscalation({event:'fresh_local_synthesis_declined',failure_code:freshLocalFailureCode,documents_acquired:freshSources.length,external_ai_invoked:false,local_model_invoked:true,assistant_text_used_for_resolution:false,fresh_context_used:freshConversationContext.contextUsed})\n    }\n    }\n  }\n",
  'route bounded fresh branch',
)
route = replaceOnce(
  route,
  '  if(!requestedAction&&!requiresFreshEvidence){',
  '  if(!requestedAction&&(!requiresFreshEvidence||freshMissUseLocal)){',
  'route ordinary local fallback',
)
route = replaceOnce(
  route,
  "  const freshFailureCode: FreshEvidenceInternalFailureCode | null = requiresFreshEvidence\n",
  "  const freshHardFail=requiresFreshEvidence&&!freshMissUseLocal\n  const freshFailureCode: FreshEvidenceInternalFailureCode | null = freshHardFail\n",
  'route hard-fail state',
)
route = replaceOnce(
  route,
  "  const reason=requiresFreshEvidence?{code:freshFailureCode!,detail:freshFailureCode === 'local_synthesis_failed'",
  "  const reason=freshHardFail?{code:freshFailureCode!,detail:freshFailureCode === 'local_synthesis_failed'",
  'route escalation reason',
)
route = replaceOnce(
  route,
  'const reply=partialCompletion?partialFreshOfficeHolderReply!:(requiresFreshEvidence?(freshFailureReply',
  'const reply=partialCompletion?partialFreshOfficeHolderReply!:(freshHardFail?(freshFailureReply',
  'route refusal selection',
)
route = replaceOnce(
  route,
  '  if(requiresFreshEvidence&&freshRetrievedAt){',
  '  if(freshHardFail&&freshRetrievedAt){',
  'route external fresh fallback',
)
writeFileSync(files.route, route)

let firstAnswer = read(files.firstAnswer)
firstAnswer = replaceOnce(
  firstAnswer,
  '    FRESH_SELECTED_EVIDENCE_BUDGET,\n  )',
  '    FRESH_SELECTED_EVIDENCE_BUDGET,\n    input.prompt,\n  )',
  'query-aware evidence selection in COS entrypoint',
)
writeFileSync(files.firstAnswer, firstAnswer)

for (const [key, path] of Object.entries(files)) assertSha(path, expected.after[key], 'postflight')
console.log('Attached COS changes applied and all four blob hashes verified.')
