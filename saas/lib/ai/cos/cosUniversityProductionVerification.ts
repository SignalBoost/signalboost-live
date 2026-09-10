import { cosServiceDb } from '../../cos-core/storage/supabase.ts'
import {
  evaluateCosUniversityProductionVerification,
  UNIVERSITY_PRODUCTION_PATHS,
  type ProductionPathEventRow,
} from './cosUniversityProductionVerificationCore.ts'

export async function readCosUniversityProductionVerification(now = new Date()) {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || ''
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || ''
  const production = process.env.VERCEL_ENV === 'production'
  if (!production || !deploymentId || !commitSha) return {
    production, deploymentId, commitSha, verified: false,
    missingOrInvalid: UNIVERSITY_PRODUCTION_PATHS,
    paths: [],
    semantics: 'exact_production_commit_and_deployment_receipts_required',
  }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('event_key,path_id,deployment_id,commit_sha,evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'production_path')
    .eq('commit_sha', commitSha)
    .order('observed_at', { ascending: false })
    .limit(500)
  if (result.error) throw result.error
  return {
    production, deploymentId, commitSha,
    ...evaluateCosUniversityProductionVerification({ deploymentId, commitSha, now, rows: (result.data || []) as ProductionPathEventRow[] }),
    semantics: 'exact_production_commit_and_deployment_receipts_required',
  }
}
