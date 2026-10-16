#!/usr/bin/env node
// Evidence-based behavioral transfer from AI training platforms to iTMounts University.
// No binaries, proprietary source, credentials or user datasets are accepted as evidence.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const PLATFORMS = Object.freeze([
  'Hugging Face','Weights & Biases','Together AI','Fireworks AI',
  'Amazon SageMaker AI','Google Vertex AI','Microsoft Foundry',
  'Databricks Mosaic AI','Kaggle','ModelScope','Replicate','Modal','RunPod'
])
export const CAPABILITIES = Object.freeze([
  'dataset_preflight','data_provenance','annotation','teacher_generation',
  'fine_tuning','distillation','distributed_training','experiment_tracking',
  'independent_evaluation','model_comparison','model_registry',
  'artifact_export','inference_serving','job_recovery','observability','cost_disclosure'
])
const METHODS = new Set(['official-docs','open-source-implementation','controlled-probe','authorized-static'])
const VERIFIED = new Set(['controlled-probe'])
const PROJECT = 'iTMounts AI University'

function nonempty(value) { return typeof value === 'string' && value.trim().length > 0 }
export function buildUniversityTransferReport(input) {
  if (!Array.isArray(input?.findings)) throw Error('findings must be an array')
  const findings = input.findings.map((item, index) => {
    if (!item || !PLATFORMS.includes(item.platform) || !CAPABILITIES.includes(item.capability)
      || !METHODS.has(item.method) || !nonempty(item.observation)
      || !nonempty(item.evidence_location) || !nonempty(item.version)
      || !nonempty(item.limitations)) throw Error('Invalid evidence record at index '+index)
    if (/^(?:\w+:)?\/\/[^\s]*@/.test(item.evidence_location)) throw Error('Credential-bearing evidence URL forbidden')
    return {
      platform:item.platform, capability:item.capability, method:item.method,
      version:item.version, evidence_location:item.evidence_location,
      observation:item.observation, limitations:item.limitations
    }
  })
  return {
    destination: PROJECT,
    source_count: new Set(findings.map(f=>f.platform)).size,
    capabilities: CAPABILITIES.map(id => {
      const evidence = findings.filter(f=>f.capability===id)
      const observed = evidence.some(f=>VERIFIED.has(f.method))
      return {
        id, status:observed ? 'behavior_observed' : evidence.length ? 'documented_or_static_only' : 'unverified',
        evidence,
        transfer_rule: observed
          ? 'Implement an independently authored equivalent and verify customer UI, backend and artifacts end-to-end'
          : 'Obtain authorized behavioral evidence before making any parity claim'
      }
    }),
    boundaries: {
      production_execution:'No new execution connector enabled by this report',
      customer_data:'Do not collect external customer data, provider secrets, or third-party binaries',
      billing:'Provider charges are paid by customer; no unapproved jobs or platform credit charges',
      supervisor:'Platform-owned repair only; no access to customer external infrastructure',
      certification:'Optional; completed training does not establish model quality',
      learning:'Customer LAB is isolated from COS Foundational Learning'
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/rea-university-transfer.mjs findings.json output.json')
    process.exitCode=2
  } else {
    try {
      const report=buildUniversityTransferReport(JSON.parse(readFileSync(process.argv[2],'utf8')))
      writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
      console.log('Evidence-bearing capabilities: '+report.capabilities.filter(c=>c.evidence.length).length+'/'+CAPABILITIES.length)
    } catch(error) { console.error(error.message); process.exitCode=1 }
  }
}
