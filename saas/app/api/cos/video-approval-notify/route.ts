// saas/app/api/cos/video-approval-notify/route.ts
// Compatibility endpoint for COSA video publication-location notifications.
//
// This route never asks for approval and never sends progress, quota, or failure
// messages. It only retries an email after a provider-confirmed live URL has been
// stored on an already-published campaign.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VIDEO_CHANNELS = ['youtube', 'short_video']
const LIMIT = 10

type OwnerResolveResult =
  | { ok: true; email: string; source: 'session' | 'cron' }
  | { ok: false; error: string }

type ListedUser = { email?: string | null }

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function isCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  return Boolean(secret && auth === `Bearer ${secret}`)
}

async function resolveOwner(req: NextRequest, sb: ReturnType<typeof admin>): Promise<OwnerResolveResult> {
  const ctx = await getAccess()
  if (ctx.isOwner && ctx.email) return { ok: true, email: ctx.email, source: 'session' }

  if (!isCronRequest(req)) return { ok: false, error: 'Owner only.' }

  const ownerEmail = String((process.env.OWNER_EMAILS || '').split(',')[0] || '').trim().toLowerCase()
  if (!ownerEmail) return { ok: false, error: 'OWNER_EMAILS is not configured.' }

  try {
    const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const users = ((listed as any)?.data?.users || []) as ListedUser[]
    const ownerExists = users.some(user => String(user.email || '').toLowerCase() === ownerEmail)
    if (!ownerExists) return { ok: false, error: `Owner user not found for ${ownerEmail}.` }
    return { ok: true, email: ownerEmail, source: 'cron' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not resolve owner user.' }
  }
}

function platformLabel(publishedKey: string) {
  const platform = String(publishedKey.split('::')[0] || 'video platform')
  if (platform === 'youtube_channels') return 'YouTube'
  return platform.replace(/_/g, ' ')
}

export async function GET(req: NextRequest) {
  const sb = admin()
  const owner = await resolveOwner(req, sb)
  if (!owner.ok) {
    return NextResponse.json(
      { ok: false, error: owner.error },
      { status: owner.error === 'Owner only.' ? 403 : 400 },
    )
  }

  const { data: campaigns, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: any[] = []

  for (const campaign of campaigns || []) {
    const published = campaign?.metadata?.published
    if (!published || typeof published !== 'object') continue

    for (const [publishedKey, entry] of Object.entries(published as Record<string, any>)) {
      if (results.length >= LIMIT) break

      const liveUrl = String((entry as any)?.result?.liveUrl || '').trim()
      if (!liveUrl || (entry as any)?.notified === true) continue

      const label = platformLabel(publishedKey)
      const sent = await sendEmail({
        from: 'saasMarketing',
        to: owner.email,
        subject: `Published on ${label}: ${String(campaign.title || 'SignalBoost video').slice(0, 90)}`,
        html: `<p><strong>${label}</strong></p><p><a href="${liveUrl}">${liveUrl}</a></p>`,
      })

      const attemptedAt = new Date().toISOString()
      const { data: fresh } = await sb
        .from('cos_campaign_queue')
        .select('metadata')
        .eq('id', campaign.id)
        .single()
      const freshMetadata = fresh?.metadata || campaign.metadata || {}
      const freshPublished = freshMetadata?.published && typeof freshMetadata.published === 'object'
        ? freshMetadata.published
        : {}
      const currentEntry = freshPublished[publishedKey] || entry || {}
      const notifyAttempts = Number(currentEntry?.notifyAttempts || 0) + 1

      await sb.from('cos_campaign_queue').update({
        metadata: {
          ...freshMetadata,
          published: {
            ...freshPublished,
            [publishedKey]: {
              ...currentEntry,
              notified: Boolean(sent?.ok),
              notifyError: sent?.ok ? null : sent?.error || 'send failed',
              notifyAttemptedAt: attemptedAt,
              notifyAttempts,
              ...(sent?.ok ? { notifiedAt: attemptedAt } : {}),
            },
          },
        },
      }).eq('id', campaign.id)

      results.push({
        campaign: campaign.id,
        publishedKey,
        platform: label,
        liveUrl,
        notified: Boolean(sent?.ok),
        retryable: !sent?.ok,
        attempts: notifyAttempts,
        error: sent?.ok ? null : sent?.error || 'send failed',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: campaigns?.length || 0,
    attempted: results.length,
    notified: results.filter(result => result.notified).length,
    results,
    rule: 'provider-confirmed live URLs only',
    ownerSource: owner.source,
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
