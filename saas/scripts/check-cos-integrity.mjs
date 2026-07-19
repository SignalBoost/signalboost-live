import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(process.cwd())
const conciergePath = path.join(root, 'app/api/concierge/route.ts')
const supportPath = path.join(root, 'app/api/support/route.ts')
const backupPath = path.join(root, 'lib/cos-backup/runtime.ts')
const policyPath = path.join(root, 'lib/cos-backup/continuityPolicy.ts')
const nextConfigPath = path.join(root, 'next.config.mjs')
const brainPath = path.resolve(root, '../cos-core/brain.md')

const [concierge, support, backup, policy, nextConfig, brain] = await Promise.all([
  readFile(conciergePath, 'utf8'),
  readFile(supportPath, 'utf8'),
  readFile(backupPath, 'utf8'),
  readFile(policyPath, 'utf8'),
  readFile(nextConfigPath, 'utf8'),
  readFile(brainPath, 'utf8'),
])

const failures = []
if (!/POST as supportPost/.test(concierge)) failures.push('concierge_primary_brain_missing')
if (!/runBackupWithDeadline/.test(concierge)) failures.push('concierge_bounded_backup_missing')
if (!/detectPrimaryCorruption/.test(concierge)) failures.push('concierge_degradation_detection_missing')
if (!/recordCosRecovery/.test(concierge)) failures.push('concierge_recovery_logging_missing')
if (!/primary\.status >= 400 && primary\.status < 500\) return primary/.test(concierge)) failures.push('primary_4xx_passthrough_missing')
if (!/if \(primary && reasons\.length === 0\) return primary/.test(concierge)) failures.push('healthy_primary_fast_path_missing')
if (/Promise\.all\(\[primaryPromise,\s*backupPromise/.test(concierge)) failures.push('healthy_primary_blocked_on_backup')
if (/createClient|\.from\(|\.insert\(|\.update\(|proposeCampaign|sendPress|publishCore/i.test(concierge)) failures.push('concierge_contains_direct_side_effect')
if (/linkedin|press\s*&\s*print|socialPlatformFrom|isPressCreationRequest/i.test(concierge)) failures.push('concierge_contains_keyword_workflow')
if (!/function chiefOfStaffPrompt\(/.test(support)) failures.push('chief_of_staff_prompt_missing')
if (!/loadUserMemories/.test(support)) failures.push('user_memory_loader_missing')
if (!/searchPastConversations/.test(support)) failures.push('conversation_history_missing')
if (!/getBusinessMetrics/.test(support)) failures.push('live_metrics_missing')
if (!/trusted senior advisor/.test(support)) failures.push('chief_of_staff_identity_missing')
if (!/executionAllowed: false/.test(backup) && !/execution_allowed: false/.test(concierge)) failures.push('backup_execution_lock_missing')
if (!/loadApprovedBrain/.test(backup)) failures.push('backup_brain_loader_missing')
if (!/Approved COS brain snapshot is unavailable/.test(backup)) failures.push('backup_missing_snapshot_fail_closed_missing')
if (/FALLBACK_BRAIN/.test(backup)) failures.push('backup_unapproved_fallback_present')
if (!/Activated Backup Read-Only Continuity/.test(backup)) failures.push('recovery_action_log_missing')
if (/from\s+['"]@\//.test(policy)) failures.push('continuity_policy_has_alias_import')
if (/next\/server|supabase|callModel/.test(policy)) failures.push('continuity_policy_has_runtime_dependency')
if (!/status >= 400 && status < 500/.test(policy)) failures.push('continuity_policy_4xx_passthrough_missing')
if (!/error-degraded/.test(policy)) failures.push('degraded_primary_source_missing')
if (!/outputFileTracingRoot/.test(nextConfig)) failures.push('cos_brain_trace_root_missing')
if (!/['"]\/api\/concierge['"]/.test(nextConfig)) failures.push('cos_brain_concierge_trace_missing')
if (!/\.\.\/cos-core\/brain\.md/.test(nextConfig)) failures.push('cos_brain_snapshot_trace_missing')
if (!/Schema: `signalboost-cos-brain-v1`/.test(brain)) failures.push('brain_schema_missing')
if (!/automatic read-only continuity/.test(brain)) failures.push('continuity_boundary_missing')

const report = {
  ok: failures.length === 0,
  schema: 'signalboost-cos-integrity-v2',
  brainDigest: createHash('sha256').update(brain).digest('hex'),
  conciergeDigest: createHash('sha256').update(concierge).digest('hex'),
  supportDigest: createHash('sha256').update(support).digest('hex'),
  backupDigest: createHash('sha256').update(backup).digest('hex'),
  policyDigest: createHash('sha256').update(policy).digest('hex'),
  nextConfigDigest: createHash('sha256').update(nextConfig).digest('hex'),
  failures,
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
