FILE: saas/app/api/cos-primary/route.ts

1) Add import:
import { mustFailClosedWithoutAuthoritativeLiveEvidence } from '@/lib/ai/cos/liveEvidenceFailClosed'

2) Next to the other fresh* lets (~line 229), add:
let freshMissUseLocal = false

3) Replace the block that starts with:
    if(!authoritySatisfied){

with:

    if(!authoritySatisfied){
      const hardMiss = mustFailClosedWithoutAuthoritativeLiveEvidence(lookupInput)
      if(!hardMiss && !freshSources.length){
        freshMissUseLocal = true
      } else {
        const detail=freshError||'Live search did not return authoritative evidence required for this current fact.'
        const executionProvenance=attachFreshEvidenceProvenance(authoritativeProvenance(null,{invoked:false}),{sources:freshSources,retrievedAt:freshRetrievedAt,error:detail,synthesisAccepted:false})
        ;Object.assign(executionProvenance as any, {policy:'fresh_live_data_local_first', assistant_text_used_for_resolution:false})
        const reply=freshEvidenceUnavailableReply(language,lookupInput),liveTelemetry=emitRequestTelemetry({startedAt,input,reply,source:'failed_closed',confidence:0,externalAiInvoked:false})
        await writeCosPrimaryProvenance(userId,reply,executionProvenance,'cos-fresh-evidence-unavailable',{prompt:lookupInput,answered:false,confidence:0,branch:'fresh_evidence_unavailable'})
        return NextResponse.json({ok:false,reply,error:reply,source:'cos-fresh-evidence-unavailable',confidence_score:0,confidence_threshold:confidenceThreshold(),escalation_reason_code:'insufficient_live_authority',fresh_failure_class:'insufficient_live_authority',external_ai_invoked:false,external_fallback_invoked:false,local_model_invoked:false,execution_provenance:executionProvenance,live_evidence_retrieved_this_turn:true,live_evidence_sources:freshSources.map(source=>({id:source.id,title:source.title,url:source.url})),live_telemetry:liveTelemetry,execution_allowed:false,external_action_taken:false},{status:200})
      }
    }
    if(freshMissUseLocal){
      // Skip deterministic/local-fresh synthesis. Local reasoner runs below.
    } else {

4) Close that else just before the `if(!requestedAction){ freshLocalAttempted=true` block ends the `if(requiresFreshEvidence)` section.
   Simpler alternative if you do not want to wrap the rest:
   after setting freshMissUseLocal = true, `break` out by skipping remaining fresh synthesis with:

      if(freshMissUseLocal){
        // leave requiresFreshEvidence true for telemetry, but do not synthesize or fail closed
      } else if(!authoritySatisfied){
        /* existing return */
      }

5) Change:
  if(!requestedAction&&!requiresFreshEvidence){

to:
  if(!requestedAction&&(!requiresFreshEvidence||freshMissUseLocal)){

6) Change the later fail-closed condition that uses requiresFreshEvidence to:
  const freshHardFail = requiresFreshEvidence && !freshMissUseLocal && !cos?.handled
  and keep the existing unavailable reply only when freshHardFail is true.
