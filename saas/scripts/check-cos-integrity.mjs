import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(process.cwd())
const conciergePath = path.join(root, 'app/api/concierge/route.ts')
const supportPath = path.join(root, 'app/api/support/route.ts')
const brainPath = path.resolve(root, '../cos-core/brain.md')

const [concierge, support, brain] = await Promise.all([
  readFile(conciergePath, 'utf8'),
  readFile(supportPath, 'utf8'),
  readFile(brainPath, 'utf8'),
])

const failures = []
const normalizedConcierge = concierge.replace(/\r\n/g, '\n').trim()
const expectedConcierge = [
  "import { NextRequest } from 'next/server'",
  "import { POST as supportPost } from '@/app/api/support/route'",
  '',
  'export async function POST(req: NextRequest) {',
  '  return supportPost(req)',
  '}',
].join('\n')

if (normalizedConcierge !== expectedConcierge) failures.push('concierge_not_thin_alias')
if (/RegExp|\.test\(|createClient|insert\(|update\(|send|publish|proposeCampaign|callModel/i.test(concierge)) failures.push('concierge_contains_bypass_logic')
if (!/function chiefOfStaffPrompt\(/.test(support)) failures.push('chief_of_staff_prompt_missing')
if (!/loadUserMemories/.test(support)) failures.push('user_memory_loader_missing')
if (!/searchPastConversations/.test(support)) failures.push('conversation_history_missing')
if (!/getBusinessMetrics/.test(support)) failures.push('live_metrics_missing')
if (!/trusted senior advisor/.test(support)) failures.push('chief_of_staff_identity_missing')
if (!/Schema: `signalboost-cos-brain-v1`/.test(brain)) failures.push('brain_schema_missing')
if (!/Backup COS receives the same normalized input/.test(brain)) failures.push('backup_cos_boundary_missing')

const report = {
  ok: failures.length === 0,
  schema: 'signalboost-cos-integrity-v1',
  brainDigest: createHash('sha256').update(brain).digest('hex'),
  conciergeDigest: createHash('sha256').update(concierge).digest('hex'),
  supportDigest: createHash('sha256').update(support).digest('hex'),
  failures,
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
