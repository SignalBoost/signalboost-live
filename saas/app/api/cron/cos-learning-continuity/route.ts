//
// THE WATCHDOG. Learning stopping is a SILENT failure — there is no error, no red build, no failed
// deploy. The corpus simply stops growing and every dashboard keeps rendering yesterday's rows. The
// only way that gets noticed is if something goes and looks, every day, and then comes to find you.
//
// Runs shortly after the 06:30 UTC learning cycle it judges, so it reads the result of that cycle
// rather than the previous day's.
//
// IT ONLY EMAILS WHEN SOMETHING IS WRONG. Same rule as the outreach digest: a daily "all clear"
// trains the recipient to ignore the alert, and then the one that matters is ignored too. Green
// sends nothing and reports emailed:false with the reason 'healthy'.
//
// Read-only. It never triggers a learning cycle and never calls a model.

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { readLearningContinuity } from '@/lib/ai/cos/learningContinuityReport'
import type { ContinuityReport } from '@/lib/ai/cos/learningContinuity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function ownerEmail(): string {
  const raw = process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''
  return String(raw).split(',')[0]?.trim() || ''
}

function siteUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_SAAS_URL || process.env.SAAS_PUBLIC_URL || '').trim()
  if (!configured) return 'https://saas.signalboostapp.com'
  return /^https?:\/\//i.test(configured) ? configured.replace(/\/+$/, '') : `https://${configured.replace(/^\/+|\/+$/g, '')}`
}

function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ))
}

function subjectLine(report: ContinuityReport): string {
  if (report.status === 'no_data') return 'COS learning: NO DATA — the corpus is empty'
  if (report.status === 'red') return 'COS learning: RED — the learning cycle is not producing evidence'
  return 'COS learning: AMBER — running, but not expanding'
}

function emailHtml(report: ContinuityReport): string {
  const base = siteUrl()
  const findings = report.findings.map(finding => `
    <li style="margin:0 0 12px 0">
      <strong>${escapeHtml(finding.severity.toUpperCase())} — ${escapeHtml(finding.title)}</strong><br/>
      <span style="color:#444">${escapeHtml(finding.detail)}</span>
    </li>`).join('')

  const days = report.dailyRetention.map(day => `
    <tr>
      <td style="padding:2px 12px 2px 0">${escapeHtml(day.date)}</td>
      <td style="padding:2px 12px 2px 0">${day.documents} docs</td>
      <td style="padding:2px 0">${day.subjects} subjects</td>
    </tr>`).join('')

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <h2 style="margin:0 0 4px 0">${escapeHtml(subjectLine(report))}</h2>
      <p style="margin:0 0 16px 0;color:#444">${escapeHtml(report.summary)}</p>

      <h3 style="margin:0 0 8px 0">What is wrong</h3>
      <ul style="padding-left:18px;margin:0 0 16px 0">${findings}</ul>

      <h3 style="margin:0 0 8px 0">Retention, last 7 days</h3>
      <table style="border-collapse:collapse;margin:0 0 16px 0">${days}</table>

      <p style="margin:0 0 4px 0"><strong>Last retention:</strong> ${escapeHtml(report.lastRetentionAt ?? 'never')}${report.hoursSinceLastRetention === null ? '' : ` (${report.hoursSinceLastRetention}h ago)`}</p>
      <p style="margin:0 0 4px 0"><strong>Corpus:</strong> ${report.corpusDocuments} documents · <strong>7d:</strong> ${report.documentsLast7Days} · <strong>prior 7d:</strong> ${report.documentsPrevious7Days} · <strong>new subjects:</strong> ${report.newSubjectsLast7Days}</p>
      <p style="margin:0 0 16px 0"><strong>Learning gaps:</strong> ${report.openGaps} open · ${report.resolvedGaps} resolved · ${report.totalGaps} total</p>

      <h3 style="margin:0 0 8px 0">Where to look next</h3>
      <ol style="padding-left:18px;margin:0 0 16px 0;color:#444">
        <li><a href="${base}/api/admin/cos-learning/run">/api/admin/cos-learning/run</a> — separates a saturated cycle (duplicate-dominant rejections) from a dead one (sourceErrors, or no run at all).</li>
        <li><a href="${base}/api/admin/cos-learning/coverage">/api/admin/cos-learning/coverage</a> — which declared subjects have never been studied.</li>
        <li><a href="${base}/api/admin/cos-runpod">/api/admin/cos-runpod</a> — extraction needs the reasoner; a stopped pod stops learning.</li>
      </ol>

      <p style="margin:0;color:#777;font-size:12px">Sent only because this check is not green. A healthy day sends no email.</p>
    </div>`
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await readLearningContinuity()
  // `in` rather than `!result.ok`: this repo compiles with "strict": false, where boolean-literal
  // discriminants do not narrow a union. Property-presence narrowing does.
  if ('error' in result) {
    // A read failure is itself a continuity failure — report it as one rather than 200-ing quietly.
    console.error('[cos-learning-continuity] read failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  const report = result.report
  console.log('[cos-learning-continuity]', JSON.stringify({
    status: report.status,
    hoursSinceLastRetention: report.hoursSinceLastRetention,
    documentsLast7Days: report.documentsLast7Days,
    newSubjectsLast7Days: report.newSubjectsLast7Days,
    silentDaysLast7: report.silentDaysLast7,
    openGaps: report.openGaps,
    findings: report.findings.map(f => f.code),
  }))

  if (report.status === 'green') {
    return NextResponse.json({ ok: true, status: report.status, emailed: false, reason: 'healthy', report })
  }

  const to = ownerEmail()
  if (!to) {
    return NextResponse.json({ ok: true, status: report.status, emailed: false, reason: 'no_owner_address_configured', report })
  }

  const send = await sendEmail({
    from: 'saasSupport',
    to,
    subject: subjectLine(report),
    html: emailHtml(report),
  })

  return NextResponse.json({
    ok: true,
    status: report.status,
    emailed: send.ok,
    // A count without a cause is a guessing game — carry the provider's real reason.
    reason: send.ok ? 'alert_sent' : ('error' in send ? send.error : 'send_failed'),
    report,
  })
}
