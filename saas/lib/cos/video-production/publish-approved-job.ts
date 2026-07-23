import type { User } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { getValidSocialToken } from '@/lib/outreach/social-token'
import { publishSocialPost } from '@/lib/outreach/social-connectors'
import type { getAdminSupabase } from '@/utils/supabase/server'
import { createSupabaseObjectStore, type ObjectStorePort } from '@/lib/cos/objectStore'

type AdminClient = ReturnType<typeof getAdminSupabase>

type PublishResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  liveUrl?: string | null
  providerPostId?: string
  notified?: boolean
  notifyError?: string | null
}

function wantsYouTube(job: any) {
  return Array.isArray(job?.platforms) && job.platforms.some((item: unknown) => String(item).toLowerCase().includes('youtube'))
}

async function signedVideoUrl(store: ObjectStorePort, outputUrl: string) {
  if (outputUrl.startsWith('http')) return outputUrl
  const signed = await store.signedUrl(outputUrl, 60 * 60)
  if (!signed.url) throw new Error(signed.error || 'Could not sign rendered video URL.')
  return signed.url
}

export async function publishApprovedVideoProductionJob(args: {
  admin: AdminClient
  user: User
  job: any
  renderBucket: string
  objectStore?: ObjectStorePort
}): Promise<PublishResult> {
  const { admin, user, job, renderBucket } = args
  // Rendered-asset access goes through the object-store port; a buyer passes their own.
  const objectStore = args.objectStore || createSupabaseObjectStore({ client: admin, bucket: renderBucket })
  if (!wantsYouTube(job)) return { ok: true, skipped: true, error: 'YouTube was not selected for this job.' }
  if (!job?.output_url) return { ok: false, error: 'Rendered video output is missing.' }

  const token = await getValidSocialToken(admin, user.id, 'youtube_channels')
  if (!token.ok || !token.accessToken) return { ok: false, error: token.error || 'YouTube is not connected for this user.' }

  const videoUrl = await signedVideoUrl(objectStore, String(job.output_url))
  const destinationUrl = String(job.search_package?.destination_url || 'https://saas.signalboostapp.com')
  const title = String(job.title || 'Video campaign')
  const description = String(job.search_package?.description || job.hook || title)
  const postText = `${description}\n\nLearn more: ${destinationUrl}`.trim()
  const tags = Array.isArray(job.search_package?.tags) ? job.search_package.tags.map(String).slice(0, 20) : ['SignalBoost', 'AI', 'marketing']

  const result = await publishSocialPost({
    platform: 'youtube_channels',
    title,
    text: postText,
    description: postText,
    tags,
    privacyStatus: 'public',
    videoUrl,
    accessToken: token.accessToken,
  })

  if (!result.ok || !result.liveUrl) return { ok: false, error: result.mode || 'Video publish failed.' }

  let notified = false
  let notifyError: string | null = null
  if (user.email) {
    const email = await sendEmail({
      from: 'saasMarketing',
      to: user.email,
      subject: `🎬 Your video is live on YouTube Channels: ${title}`,
      html: `
        <p>COSA finished the full pipeline for <strong>${title}</strong> and it is now live on YouTube Channels.</p>
        <p><a href="${result.liveUrl}">${result.liveUrl}</a></p>
        <p>Clicks on the description link are being tracked — traffic numbers will appear on the campaign record automatically.</p>
        <p>Click through to verify it looks right. No further action needed unless something looks off.</p>
      `.trim(),
    })
    notified = Boolean(email.ok)
    notifyError = email.ok ? null : email.error || 'Email send failed.'
  } else {
    notifyError = 'No owner email address was available for the publish notification.'
  }

  return { ok: true, liveUrl: result.liveUrl, providerPostId: result.providerPostId, notified, notifyError }
}
