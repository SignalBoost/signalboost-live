import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { CORPUS_TARGET_RECORDS } from '@/lib/business-intelligence-corpus/contracts.ts'
import { corpusCount } from '@/lib/business-intelligence-corpus/service.ts'
import { seedCorpusFromWikidataPublic } from '@/lib/business-intelligence-corpus/wikidata-public.ts'
import {
  WIKIDATA_POPULATION_BATCH_SIZE,
  nextWikidataPopulationOffset,
  normalizeWikidataPopulationOffset,
} from '@/lib/business-intelligence-corpus/wikidata-population.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret) return auth === `Bearer ${secret}`
  return (req.headers.get('user-agent') || '').toLowerCase() === 'vercel-cron/1.0'
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const before = await corpusCount()
  if (before >= CORPUS_TARGET_RECORDS) {
    return NextResponse.json({
      ok: true,
      ready: true,
      target: CORPUS_TARGET_RECORDS,
      count: before,
      remaining: 0,
      netAdded: 0,
      providerCalls: 0,
      externalAiCalls: 0,
    })
  }

  const admin = getAdminSupabase()
  const { data: state, error: stateError } = await admin
    .from('business_intelligence_corpus_seed_state')
    .select('source,raw_offset,runs')
    .eq('source', 'wikidata')
    .maybeSingle()

  if (stateError) {
    console.error('business intelligence corpus seed state read failed:', stateError)
    return NextResponse.json({ ok: false, error: 'CORPUS_SEED_STATE_READ_FAILED' }, { status: 500 })
  }

  const offset = normalizeWikidataPopulationOffset(state?.raw_offset)
  const result = await seedCorpusFromWikidataPublic({
    apply: true,
    limit: WIKIDATA_POPULATION_BATCH_SIZE,
    offset,
  })

  if (result.failed > 0) {
    console.error('business intelligence corpus Wikidata population partial failure:', result.failures)
    return NextResponse.json({ ok: false, cursorAdvanced: false, ...result }, { status: 207 })
  }

  const nextOffset = nextWikidataPopulationOffset(offset, result.requested)
  const runs = Math.max(0, Number(state?.runs) || 0) + 1
  const summary = {
    source: result.source,
    sourceClass: result.sourceClass,
    requested: result.requested,
    fetchedCandidates: result.fetchedCandidates,
    alreadyPresent: result.alreadyPresent,
    newCandidates: result.newCandidates,
    succeeded: result.succeeded,
    netAdded: result.netAdded,
    before: result.before,
    after: result.after,
    rawOffset: offset,
    nextRawOffset: nextOffset,
    providerCalls: 0,
    externalAiCalls: 0,
  }

  const { error: updateError } = await admin
    .from('business_intelligence_corpus_seed_state')
    .upsert({
      source: 'wikidata',
      raw_offset: nextOffset,
      runs,
      last_result: summary,
      last_succeeded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source' })

  if (updateError) {
    console.error('business intelligence corpus seed state update failed:', updateError)
    return NextResponse.json({
      ok: false,
      error: 'CORPUS_SEED_STATE_UPDATE_FAILED',
      cursorAdvanced: false,
      ...result,
    }, { status: 500 })
  }

  const count = await corpusCount()
  return NextResponse.json({
    ok: true,
    ready: count >= CORPUS_TARGET_RECORDS,
    target: CORPUS_TARGET_RECORDS,
    count,
    remaining: Math.max(0, CORPUS_TARGET_RECORDS - count),
    cursorAdvanced: true,
    nextOffset,
    ...result,
  })
}
