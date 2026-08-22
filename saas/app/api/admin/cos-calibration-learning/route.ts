import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readCalibrationLearningReport } from '@/lib/ai/cos/calibrationLearningStore'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function GET(request:NextRequest){const guard=await requireOwner();if(!guard.ok)return NextResponse.json({error:guard.error},{status:guard.status});const limit=Number(request.nextUrl.searchParams.get('limit'));const report=await readCalibrationLearningReport(Number.isFinite(limit)&&limit>0?limit:undefined);return NextResponse.json(report,{status:report.ok?200:503})}
