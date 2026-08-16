// saas/app/api/outreach/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import { applyOutreachSignature } from '@/lib/outreach/signature'
import { getRecipientHistory, duplicateReason, normalizeAddress } from '@/lib/outreach/recipientHistory'
import { sendEmail as sendLegacyEmail } from '@/lib/email'
import { sendCosOutreachEmail } from '@/lib/communication-hub/cos-email'
import { resolveBuyerEmailDelivery } from '@/lib/communication-hub/runtime'
import { markOutreachSent } from '@/lib/outreach/markSent'
import { buildRevenueEvent } from '@/lib/revenue/events/revenue-event.ts'
import { recordVerifiedRevenueEventOutcome } from '@/lib/revenue/events/cos-outcome-learning.ts'

export const dynamic = 'force-dynamic'

function draftedSubject(outreach: any): string {
  const summary = outreach?.analyzer_summary
  const subject = summary && typeof summary === 'object' ? summary.outreach_subject : ''
  return typeof subject === 'string' ? subject.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))
}

function runtimeEnvironmentId(): string {
  return String(process.env.VERCEL_ENV || process.env.NODE_ENV || 'production').trim() || 'production'
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const outreachId = String(body?.outreach_id || body?.id || '').trim()
  const channel = String(body?.channel || 'manual').trim().toLowerCase()
  const toEmail = body?.to_email ? String(body.to_email).trim().toLowerCase() : ''
  if (!outreachId) return NextResponse.json({ error: 'outreach_id is required' }, { status: 400 })

  if (await isOutreachSendingDisabled(ctx.admin)) {
    return NextResponse.json({ error: 'Outreach sending is disabled by the panic switch.' }, { status: 423 })
  }

  const { data: outreach, error } = await ctx.admin
    .from('outreach_queue')
    .select('*')
    .eq('id', outreachId)
    .single()

  if (error || !outreach) return NextResponse.json({ error: error?.message || 'Outreach not found' }, { status: 404 })

  const { data: priorSend } = await ctx.admin
    .from('outreach_sends')
    .select('id,sent_at,metadata')
    .eq('outreach_id', outreachId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (priorSend) {
    const queueReconcile = await markOutreachSent(ctx.admin, outreachId, priorSend.sent_at || new Date().toISOString())
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      sentAt: priorSend.sent_at,
      providerResult: priorSend.metadata?.providerResult || { mode: 'resend', id: priorSend.metadata?.resendId },
      queueReconcile,
    })
  }

  if (outreach.status !== 'approved') return NextResponse.json({ error: 'Outreach must be approved before sending.' }, { status: 409 })

  const outboundMessage = applyOutreachSignature(String(outreach.outreach_message || ''), outreach.sender_key || 'saasSales')
  const recipientAddress = normalizeAddress(outreach.contact_email)
  const force = body?.force === true
  if (!force) {
    const history = await getRecipientHistory(ctx.admin, recipientAddress, outreachId, outreach.product_key)
    if (history.contacted) {
      return NextResponse.json({
        error: duplicateReason(history, recipientAddress),
        duplicateRecipient: true,
        lastSentAt: history.lastSentAt,
        previousBusiness: history.businessName,
      }, { status: 409 })
    }
  }

  const safe = assertSafeOutreachMessage(outboundMessage)
  if (!safe.ok) return NextResponse.json({ error: safe.reason }, { status: 400 })

  const limit = await enforceDailySendLimit(ctx.admin, 50)
  if (!limit.ok) return NextResponse.json({ error: 'Daily outreach send limit reached', sendLimit: limit }, { status: 429 })

  let providerResult: Record<string, unknown> = { mode: 'manual_record_only' }
  let providerConfirmedEmail = false
  let usedCommunicationHub = false
  if (channel === 'email' && toEmail) {
    const subject = draftedSubject(outreach) || `Useful SignalBoost growth preview for ${outreach.business_name}`
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(outboundMessage)}</div>`
    const delivery = resolveBuyerEmailDelivery(String(ctx.user.id || 'signalboost'))

    if (delivery) {
      const sent = await sendCosOutreachEmail(delivery, {
        to: [{ email: toEmail }],
        subject,
        text: outboundMessage,
        html,
      }, true)
      if (!sent.ok) {
        return NextResponse.json({ error: sent.errorCode || 'Email send failed', providerResult: sent }, { status: 502 })
      }
      providerConfirmedEmail = true
      usedCommunicationHub = true
      providerResult = { ...sent, providerId: delivery.providerId, communicationHub: true }
    } else {
      // Backward-compatible host fallback while existing SignalBoost deployments
      // migrate to COMMUNICATION_EMAIL_PROVIDER. Buyer deployments should configure
      // the Communication Hub and therefore never depend on this host-specific path.
      const sent = await sendLegacyEmail({
        from: 'saasSales',
        to: toEmail,
        subject,
        html,
      })
      if (!sent.ok) return NextResponse.json({ error: sent.error || 'Email send failed', providerResult: sent }, { status: 502 })
      providerConfirmedEmail = true
      providerResult = { ...sent, communicationHub: false, legacyFallback: true }
    }
  }

  const sentAt = new Date().toISOString()
  const { data: sendRecord, error: sendError } = await ctx.admin.from('outreach_sends').insert({
    outreach_id: outreachId,
    business_id: outreach.business_id,
    channel,
    sent_at: sentAt,
    metadata: { providerResult, toEmail: toEmail || null },
  }).select('id').single()
  if (sendError || !sendRecord?.id) return NextResponse.json({ error: sendError?.message || 'Outreach send record failed', providerResult }, { status: 500 })

  const queueReconcile = await markOutreachSent(ctx.admin, outreachId, sentAt)

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.send',
    targetType: 'outreach_queue',
    targetId: outreachId,
    metadata: { channel, providerResult, queueReconcile },
  })

  // COS learning is deliberately downstream of the provider confirmation and durable send record.
  // It is best-effort telemetry: a learning write can never turn a successful outreach send into an
  // API failure. Manual-record-only paths are excluded because they do not prove actual delivery.
  if (providerConfirmedEmail) {
    try {
      const providerId = typeof providerResult.providerId === 'string' ? providerResult.providerId : ''
      const revenueEvent = buildRevenueEvent({
        eventId: `outreach-send:${sendRecord.id}`,
        tenant: {
          tenantId: String(outreach.user_id || ctx.user.id || 'signalboost'),
          environmentId: runtimeEnvironmentId(),
        },
        occurredAt: sentAt,
        type: 'email_sent',
        source: usedCommunicationHub ? 'communication_hub' : 'external_provider',
        ...(providerId ? { sourceProvider: providerId } : {}),
        ...(outreach.campaign_job_id ? { campaign: { id: String(outreach.campaign_job_id) } } : {}),
        confidence: 1,
        evidenceRefs: [`outreach_sends:${sendRecord.id}`],
        correlationId: outreachId,
      })
      await recordVerifiedRevenueEventOutcome(revenueEvent)
    } catch (learningError) {
      console.warn('[outreach] COS revenue outcome learning failed', learningError)
    }
  }

  return NextResponse.json({
    ok: true,
    sentAt,
    sendLimit: { ...limit, count: limit.count + 1 },
    providerResult,
    queueReconcile,
  })
}
