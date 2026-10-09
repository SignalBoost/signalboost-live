// Owner-controlled, zero-spend launch evidence collector.
// CI tests are contract evidence, NOT proof of a genuine commercial LAB transaction.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const sha=process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'
const revision=/^[0-9a-f]{40}$/i.test(sha)?sha:'unknown'
const outDir=process.env.ITMOUNTS_ACCEPTANCE_OUTPUT_DIR || 'artifacts/launch-acceptance'
mkdirSync(outDir,{recursive:true})
const cases=[
  ['lab_university_authorization','tests/itmountsLabUniversityExecution.node.test.ts'],
  ['lab_experiment_start','tests/itmountsLabExperimentStart.node.test.ts'],
  ['byoi_scope','tests/itmountsLabByoiScope.node.test.ts'],
  ['byoi_execution','tests/itmountsLabByoiExecution.node.test.ts'],
  ['tenant_egress','tests/itmountsLabEgressExecution.node.test.ts'],
  ['supervisor_platform_ownership','tests/supervisorPlatformOwnership.node.test.ts'],
  ['supervisor_no_customer_provider','tests/supervisorNoByoiExecution.node.test.ts'],
  ['supervisor_webhook_scope','tests/supervisorWebhookScope.node.test.ts'],
  ['phase5_evidence','tests/labPhase5VerifiedCohort.node.test.ts'],
  ['stripe_test_contract','tests/phase4StripeTestVerification.node.test.mjs'],
  ['wallet_invariants','tests/phase4CommercialWalletAudit.node.test.mjs'],
]
const results=[]
for(const [id,file] of cases){
  const started=new Date().toISOString()
  const run=spawnSync(process.execPath,['--test',file],{cwd:process.cwd(),encoding:'utf8',timeout:120000,maxBuffer:1024*1024*2})
  const status=run.error?'ERROR':run.status===0?'PASS':'FAIL'
  results.push({id,scope:'repository_contract',status,startedAt:started,finishedAt:new Date().toISOString(),exitCode:run.status,error:run.error?.message?.slice(0,160)||null,diagnostic:status==='PASS'?null:(run.stderr||run.stdout||'').slice(-1600)})
  console.log(JSON.stringify({id,status,exitCode:run.status,diagnostic:status==='PASS'?undefined:(run.stderr||run.stdout||'').slice(-1000)}))
}
const outstanding=['live_public_http','owner_login','organization_creation','cross_tenant_live_requests','real_experiment','provider_execution_receipt','training_or_distillation_receipt','evaluation','artifact_retrieval','stripe_test_webhook_settlement','controlled_recovery','exact_revision_rollback']
const report={schema:'itmounts-launch-acceptance-v1',revision,generatedAt:new Date().toISOString(),environment:'CI',realCustomerDataUsed:false,externalProviderSpendAuthorized:false,contractTests:results,liveAcceptance:outstanding.map(id=>({id,status:'NOT_RUN',evidenceRef:null})),releaseReady:false,reason:'Live authenticated production transaction evidence has not been supplied or executed'}
writeFileSync(join(outDir,'report.json'),JSON.stringify(report,null,2)+'\n')
if(results.some(x=>x.status!=='PASS'))process.exitCode=1
