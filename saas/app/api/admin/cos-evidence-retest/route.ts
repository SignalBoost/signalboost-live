import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { RETEST_DEFAULT_LOOKBACK_DAYS, readEvidenceRetestReport, runEvidenceTriggeredRetest } from '@/lib/ai/cos/evidenceTriggeredRetestStore'
import { MAX_RETEST_PROMOTIONS_PER_CYCLE, RETEST_MINIMUM_COVERAGE, RETEST_MINIMUM_MATCHED_TERMS, RETEST_MINIMUM_SOURCE_CONFIDENCE } from '@/lib/ai/cos/evidenceTriggeredRetest'
export const runtime='nodejs';export const dynamic='force-dynamic'
const note='A promotion is a measurement request, never a result. The existing budgeted benchmark runner alone scores the retest; this endpoint makes no model calls.'
const thresholds={lookbackDays:RETEST_DEFAULT_LOOKBACK_DAYS,minimumMatchedTerms:RETEST_MINIMUM_MATCHED_TERMS,minimumCoverage:RETEST_MINIMUM_COVERAGE,minimumSourceConfidence:RETEST_MINIMUM_SOURCE_CONFIDENCE,maxPromotionsPerCycle:MAX_RETEST_PROMOTIONS_PER_CYCLE}
export async function GET(){const guard=await requireOwner();if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status});const report=await readEvidenceRetestReport();return NextResponse.json({...report,thresholds,note},{status:report.ok?200:503})}
export async function POST(request:NextRequest){const guard=await requireOwner();if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status});const parsed=Number(request.nextUrl.searchParams.get('lookbackDays'));const dryRun=request.nextUrl.searchParams.get('dry')==='1';const summary=await runEvidenceTriggeredRetest({dryRun,lookbackDays:Number.isFinite(parsed)&&parsed>0?parsed:undefined});return NextResponse.json({ok:summary.enabled,dryRun,summary,thresholds,note})}
