#!/usr/bin/env node
// Convert evidence from REA Cursor probes to an auditable iTMounts Builder transfer backlog.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const features = ['task_planning','workspace_editing','terminal_execution','test_repair','checkpoint_resume','stall_recovery','context_management','tool_integration','verification_gate','artifact_delivery']
const methods = new Set(['rea-static','rea-runtime','documented-behavior','controlled-probe'])
export function buildTransferReport(input) {
  if (!Array.isArray(input?.findings)) throw Error('A curated findings array is required; REA static output is not proof of runtime behavior')
  const capabilities = features.map(id => {
    const evidence = input.findings.filter(f => f && f.target === 'Cursor' && f.capability === id && methods.has(f.method)
      && typeof f.evidence_location === 'string' && f.evidence_location.trim()
      && typeof f.observation === 'string' && f.observation.trim())
    const observed = evidence.some(f => f.method === 'rea-runtime' || f.method === 'controlled-probe')
    return { id, status: observed ? 'behavior_observed' : evidence.length ? 'static_or_documented_only' : 'unverified',
      evidence: evidence.map(f => ({ method:f.method, location:f.evidence_location, observation:f.observation,
        limitations:String(f.limitations || '') })),
      next: observed ? 'Implement an independent equivalent in iTMounts and test live' : 'Obtain a controlled behavioral probe before claiming parity' }
  })
  return { target:'Cursor', destination:'iTMounts Builder', capabilities,
    observed_count:capabilities.filter(c=>c.status==='behavior_observed').length,
    acceptance:{ project:'OrderFlow', files:15, minimumTests:20,
      commands:['npm test','node --test test/*.test.js','node index.js'],
      evidenceRule:'Each command must exit 0 against the final persisted source revision' } }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  if (process.argv.length !== 4) { console.error('Usage: node scripts/rea-builder-transfer.mjs findings.json output.json'); process.exit(2) }
  try { const result=buildTransferReport(JSON.parse(readFileSync(process.argv[2],'utf8')))
    writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600})
    console.log('Observed features: '+result.observed_count+'/'+result.capabilities.length)
  } catch(e) { console.error(e.message); process.exitCode=1 }
}
