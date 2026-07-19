// saas/app/api/cron/cos-video-approval-email/route.ts
// Compatibility cron wrapper for provider-confirmed publication-location emails.
// No approval, progress, quota, or failure email is sent by this endpoint.

export { GET, POST } from '@/app/api/cos/video-approval-notify/route'
