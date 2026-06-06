import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { createSupabaseAdmin, RENDER_BUCKET, SIGNED_URL_TTL } from '@/lib/video/pipeline'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: saasSupabaseCookieOptions,
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  })
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseAdmin()
  const { data: job, error } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('id', jobId)
    .or(`user_id.eq.${user.id},account_id.eq.${user.id}`)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  let downloadUrl: string | null = null
  const resultPath = job.queue_payload?.resultPath || job.result_path || null
  if (job.status === 'completed' && resultPath) {
    const { data } = await supabase.storage.from(RENDER_BUCKET).createSignedUrl(resultPath, SIGNED_URL_TTL)
    downloadUrl = data?.signedUrl || job.result_url || null
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    jobType: job.job_type,
    resultUrl: downloadUrl,
    error: job.error || null,
    updatedAt: job.updated_at,
  })
}
