import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(process.cwd())
const conciergePath = path.join(root, 'app/api/concierge/route.ts')
const supportPath = path.join(root, 'app/api/support/route.ts')
const supportCorePath = path.join(root, 'app/api/support/routeCoreLegacy.ts')
const backupRuntimePath = path.join(root, 'lib/cos-backup/runtime.ts')
const backupPolicyPath = path.join(root, 'lib/cos-backup/policy.ts')
const nextConfigPath = path.join(root, 'next.config.mjs')
const brainPath = path.resolve(root, '../cos-core/brain.md')

const [concierge, support, supportCore, backupRuntime, backupPolicy, nextConfig, brain] = await Promise.all([
  readFile(conciergePath, 'utf8'),
  readFile(supportPath, 'utf8'),
  readFile(supportCorePath, 'utf8'),
  readFile(backupRuntimePath, 'utf8'),
  readFile(backupPolicyPath, 'utf8'),
  readFile(nextConfigPath, 'utf8'),
  readFile(brainPath, 'utf8'),
])

const failures = []

if (!/POST as supportPost/.test(concierge)) failures.push('concierge_primary_brain_missing')
if (!/runBackupCos/.test(concierge)) failures.push('concierge_backup_continuity_missing')
if (!/detectPrimaryCorruption/.test(concierge)) failures.push('concierge_corruption_policy_missing')
if (!/recordCosRecovery/.test(concierge)) failures.push('concierge_recovery_logging_missing')
if (!/primary\.status >= 400 && primary\.status < 500\) return primary/.test(concierge)) failures.push('primary_4xx_passthrough_missing')
if (!/\bafter\s*\(/.test(concierge)) failures.push('healthy_primary_nonblocking_shadow_missing')
if (/const backupPromise = runBackupCos/.test(concierge)) failures.push('backup_started_before_primary_result')
if (/Promise\.all\s*\(\s*\[\s*primaryPromise\s*,\s*backupPromise/.test(concierge)) failures.push('healthy_primary_blocked_by_backup')
if (/createClient|\.from\(|\.insert\(|\.update\(|proposeCampaign|sendPress|publishCore|socialPlatformFrom|isPressCreationRequest/i.test(concierge)) failures.push('concierge_contains_direct_business_side_effect')

// The public support route is now a provenance/wake-permission wrapper around routeCoreLegacy.ts.
// Validate Chief-of-Staff invariants against the implementation module that actually owns them,
// while separately requiring the wrapper to delegate to that module. This keeps the integrity gate
// aligned with the current split architecture instead of silently checking the wrong file.
if (!/POST as legacyPOST/.test(support) || !/from ['"]\.\/routeCoreLegacy['"]/.test(support)) failures.push('support_core_delegation_missing')
if (!/function chiefOfStaffPrompt\(/.test(supportCore)) failures.push('chief_of_staff_prompt_missing')
if (!/loadUserMemories/.test(supportCore)) failures.push('user_memory_loader_missing')
if (!/searchPastConversations/.test(supportCore)) failures.push('conversation_history_missing')
if (!/getBusinessMetrics/.test(supportCore)) failures.push('live_metrics_missing')
if (!/trusted senior advisor/.test(supportCore)) failures.push('chief_of_staff_identity_missing')

if (!/withDeadline/.test(backupRuntime) || !/COS_BACKUP_TIMEOUT_MS/.test(backupRuntime)) failures.push('backup_deadline_missing')
if (!/loadApprovedBrain/.test(backupRuntime)) failures.push('backup_brain_loader_missing')
if (!/Approved COS brain snapshot is unavailable/.test(backupRuntime)) failures.push('backup_missing_snapshot_fail_closed_missing')
if (/FALLBACK_BRAIN/.test(backupRuntime)) failures.push('backup_unapproved_fallback_present')
if (!/executionAllowed: false/.test(backupRuntime) && !/execution_allowed: false/.test(concierge)) failures.push('backup_execution_lock_missing')
if (!/error-degraded/.test(backupPolicy)) failures.push('degraded_primary_detection_missing')
if (!/status >= 400 && status < 500/.test(backupPolicy)) failures.push('continuity_policy_4xx_passthrough_missing')
if (/@\/|next\/server|supabase|callModel/.test(backupPolicy)) failures.push('backup_policy_not_dependency_free')

if (!/outputFileTracingRoot/.test(nextConfig)) failures.push('cos_brain_trace_root_missing')
if (!/['"]\/api\/concierge['"]/.test(nextConfig)) failures.push('cos_brain_concierge_trace_missing')
if (!/\.\.\/cos-core\/brain\.md/.test(nextConfig)) failures.push('cos_brain_snapshot_trace_missing')

if (!/Schema: `signalboost-cos-brain-v1`/.test(brain)) failures.push('brain_schema_missing')
if (!/Healthy Primary responses must return without waiting for Backup COS/.test(brain)) failures.push('nonblocking_continuity_boundary_missing')
if (!/execution_allowed: false/.test(brain)) failures.push('brain_execution_lock_missing')

const report = {
  ok: failures.length === 0,
  schema: 'signalboost-cos-integrity-v4',
  brainDigest: createHash('sha256').update(brain).digest('hex'),
  conciergeDigest: createHash('sha256').update(concierge).digest('hex'),
  supportDigest: createHash('sha256').update(support).digest('hex'),
  supportCoreDigest: createHash('sha256').update(supportCore).digest('hex'),
  backupRuntimeDigest: createHash('sha256').update(backupRuntime).digest('hex'),
  backupPolicyDigest: createHash('sha256').update(backupPolicy).digest('hex'),
  nextConfigDigest: createHash('sha256').update(nextConfig).digest('hex'),
  failures,
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)