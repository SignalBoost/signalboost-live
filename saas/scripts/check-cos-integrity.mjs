import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(process.cwd())
const conciergePath = path.join(root, 'app/api/concierge/route.ts')
const supportPath = path.join(root, 'app/api/support/route.ts')
const backupRuntimePath = path.join(root, 'lib/cos-backup/runtime.ts')
const backupPolicyPath = path.join(root, 'lib/cos-backup/policy.ts')
const brainPath = path.resolve(root, '../cos-core/brain.md')

const [concierge, support, backupRuntime, backupPolicy, brain] = await Promise.all([
  readFile(conciergePath, 'utf8'),
  readFile(supportPath, 'utf8'),
  readFile(backupRuntimePath, 'utf8'),
  readFile(backupPolicyPath, 'utf8'),
  readFile(brainPath, 'utf8'),
])

const failures = []

if (!/POST as supportPost/.test(concierge)) failures.push('concierge_primary_brain_missing')
if (!/runBackupCos/.test(concierge)) failures.push('concierge_backup_continuity_missing')
if (!/detectPrimaryCorruption/.test(concierge)) failures.push('concierge_corruption_policy_missing')
if (!/recordCosRecovery/.test(concierge)) failures.push('concierge_recovery_logging_missing')
if (!/\bafter\s*\(/.test(concierge)) failures.push('healthy_primary_nonblocking_shadow_missing')
if (/Promise\.all\s*\(\s*\[\s*primaryPromise\s*,\s*backupPromise/.test(concierge)) failures.push('healthy_primary_blocked_by_backup')
if (/createClient|\.from\(|\.insert\(|\.update\(|proposeCampaign|sendPress|publishCore|socialPlatformFrom|isPressCreationRequest/i.test(concierge)) failures.push('concierge_contains_direct_business_side_effect')

if (!/function chiefOfStaffPrompt\(/.test(support)) failures.push('chief_of_staff_prompt_missing')
if (!/loadUserMemories/.test(support)) failures.push('user_memory_loader_missing')
if (!/searchPastConversations/.test(support)) failures.push('conversation_history_missing')
if (!/getBusinessMetrics/.test(support)) failures.push('live_metrics_missing')
if (!/trusted senior advisor/.test(support)) failures.push('chief_of_staff_identity_missing')

if (!/withDeadline/.test(backupRuntime) || !/COS_BACKUP_TIMEOUT_MS/.test(backupRuntime)) failures.push('backup_deadline_missing')
if (!/loadApprovedBrain/.test(backupRuntime)) failures.push('backup_brain_loader_missing')
if (!/executionAllowed: false/.test(backupRuntime) && !/execution_allowed: false/.test(concierge)) failures.push('backup_execution_lock_missing')
if (!/error-degraded/.test(backupPolicy)) failures.push('degraded_primary_detection_missing')
if (/@\/|next\/server|supabase|callModel/.test(backupPolicy)) failures.push('backup_policy_not_dependency_free')

if (!/Schema: `signalboost-cos-brain-v1`/.test(brain)) failures.push('brain_schema_missing')
if (!/Healthy Primary responses must return without waiting for Backup COS/.test(brain)) failures.push('nonblocking_continuity_boundary_missing')
if (!/execution_allowed: false/.test(brain)) failures.push('brain_execution_lock_missing')

const report = {
  ok: failures.length === 0,
  schema: 'signalboost-cos-integrity-v2',
  brainDigest: createHash('sha256').update(brain).digest('hex'),
  conciergeDigest: createHash('sha256').update(concierge).digest('hex'),
  supportDigest: createHash('sha256').update(support).digest('hex'),
  backupRuntimeDigest: createHash('sha256').update(backupRuntime).digest('hex'),
  backupPolicyDigest: createHash('sha256').update(backupPolicy).digest('hex'),
  failures,
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
