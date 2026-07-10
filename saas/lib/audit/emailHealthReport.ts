// saas/lib/audit/emailHealthReport.ts
// Email Deliverability & DNS Health report. Live-checks every domain the
// platform sends from (derived from SENDERS in lib/email.ts): MX (can the
// domain RECEIVE mail — missing MX means every customer reply bounces),
// SPF, DKIM (Resend selector), DMARC, and Resend domain verification when
// RESEND_API_KEY is configured. Server-only: uses node:dns.
// Built after a production incident where signalboostapp.com had no MX
// records and all inbound mail to the six sender addresses timed out.

import { promises as dns } from 'node:dns'
import { SENDERS } from '@/lib/email'
import { scoreFromFindings, type Finding, type AuditScore } from '@/lib/audit/reportModel'

export type EmailDomainView = {
  domain: string
  senders: string[]
  mx: { host: string; priority: number }[]
  spf: string | null
  spfCount: number
  dkim: boolean
  dmarc: string | null
  resend: 'verified' | 'unverified' | 'not_found' | 'no_api_key' | 'api_error'
}

export type EmailHealthReportView = {
  generatedAt: string
  domains: EmailDomainView[]
  findings: Finding[]
  score: AuditScore
  summary: { domains: number; canReceive: number; canAuthSend: number; resendVerified: number }
}

function senderDomains(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const value of Object.values(SENDERS)) {
    const m = String(value).match(/<([^>]+)>/)
    const addr = (m ? m[1] : String(value)).trim().toLowerCase()
    const at = addr.lastIndexOf('@')
    if (at < 0) continue
    const domain = addr.slice(at + 1)
    const list = map.get(domain) || []
    list.push(addr)
    map.set(domain, list)
  }
  return map
}

async function txt(host: string): Promise<string[]> {
  try {
    const rows = await dns.resolveTxt(host)
    return rows.map(parts => parts.join(''))
  } catch {
    return []
  }
}

async function mxFor(domain: string): Promise<{ host: string; priority: number }[]> {
  try {
    const rows = await dns.resolveMx(domain)
    return rows.map(r => ({ host: r.exchange, priority: r.priority })).sort((a, b) => a.priority - b.priority)
  } catch {
    return []
  }
}

async function resendStatus(domain: string): Promise<EmailDomainView['resend']> {
  const key = process.env.RESEND_API_KEY
  if (!key) return 'no_api_key'
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) return 'api_error'
    const json: any = await res.json().catch(() => null)
    const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
    const row = rows.find(r => String(r?.name || '').toLowerCase() === domain)
    if (!row) return 'not_found'
    return String(row.status || '').toLowerCase() === 'verified' ? 'verified' : 'unverified'
  } catch {
    return 'api_error'
  }
}

function finding(
  id: string,
  severity: Finding['severity'],
  domain: string,
  fallback: { title: string; detail: string; recommendation: string; impact?: string },
): Finding {
  return {
    id,
    provider: 'email-dns',
    category: 'config',
    severity,
    messageKey: `audit.email.findings.${id.replace(/[^a-z0-9-]/gi, '-')}`,
    params: { domain },
    fallback,
    derivedFrom: 'manual',
    evidenceRequired: false,
    status: 'open',
  }
}

export async function buildEmailHealthReport(): Promise<EmailHealthReportView> {
  const domains: EmailDomainView[] = []
  const findings: Finding[] = []

  for (const [domain, senders] of senderDomains()) {
    const [mx, rootTxt, dkimTxt, dmarcTxt, resend] = await Promise.all([
      mxFor(domain),
      txt(domain),
      txt(`resend._domainkey.${domain}`),
      txt(`_dmarc.${domain}`),
      resendStatus(domain),
    ])
    const spfRecords = rootTxt.filter(v => /^v=spf1\b/i.test(v.trim()))
    const view: EmailDomainView = {
      domain,
      senders,
      mx,
      spf: spfRecords[0] || null,
      spfCount: spfRecords.length,
      dkim: dkimTxt.length > 0,
      dmarc: dmarcTxt.find(v => /^v=DMARC1\b/i.test(v.trim())) || null,
      resend,
    }
    domains.push(view)

    if (!mx.length) {
      findings.push(finding(`email-mx-missing-${domain}`, 'critical', domain, {
        title: `No MX records for ${domain}`,
        detail: `The domain ${domain} publishes zero MX records, so it cannot receive email at all. Every reply a customer sends to any @${domain} address (${senders.join(', ')}) bounces with a connection timeout.`,
        recommendation: `Add MX records in the DNS panel (Vercel → Domains → ${domain} → DNS Records). For free forwarding: mx1.improvmx.com (priority 10) and mx2.improvmx.com (priority 20), plus an ImprovMX catch-all alias to the owner inbox. For real mailboxes use Zoho Mail or Google Workspace MX records.`,
        impact: 'All inbound email to this domain is lost, including customer replies and provider compliance threads.',
      }))
    }
    if (!spfRecords.length) {
      findings.push(finding(`email-spf-missing-${domain}`, 'high', domain, {
        title: `No SPF record for ${domain}`,
        detail: `No TXT record starting with v=spf1 exists at ${domain}. Receiving servers cannot verify which senders are authorized, so outbound platform mail is likely to land in spam or be rejected.`,
        recommendation: `Add one TXT record at ${domain} with the SPF policy covering every outbound provider, e.g. "v=spf1 include:amazonses.com include:spf.improvmx.com ~all" (Resend sends via Amazon SES; check the Resend dashboard for the exact value it asks for).`,
        impact: 'Outbound approval/publish notification emails may be silently spam-foldered.',
      }))
    } else if (spfRecords.length > 1) {
      findings.push(finding(`email-spf-multiple-${domain}`, 'high', domain, {
        title: `Multiple SPF records on ${domain}`,
        detail: `${domain} publishes ${spfRecords.length} TXT records starting with v=spf1. The SPF standard allows exactly one; multiple records make SPF evaluation PERMERROR and receivers treat it as failed.`,
        recommendation: 'Merge all include: mechanisms into a single v=spf1 TXT record and delete the extras.',
      }))
    }
    if (!view.dkim) {
      findings.push(finding(`email-dkim-missing-${domain}`, 'high', domain, {
        title: `No Resend DKIM record for ${domain}`,
        detail: `No TXT record exists at resend._domainkey.${domain}. Without DKIM, receivers cannot cryptographically verify platform mail, hurting deliverability and blocking DMARC alignment.`,
        recommendation: `Open the Resend dashboard → Domains → ${domain} and add the DKIM TXT record it shows to the DNS panel.`,
      }))
    }
    if (!view.dmarc) {
      findings.push(finding(`email-dmarc-missing-${domain}`, 'medium', domain, {
        title: `No DMARC policy for ${domain}`,
        detail: `No TXT record exists at _dmarc.${domain}. Anyone can spoof @${domain} addresses and mailbox providers have no policy to act on.`,
        recommendation: `Add a TXT record at _dmarc.${domain} with value "v=DMARC1; p=quarantine; rua=mailto:saasmarketing@${domain}" once MX/forwarding works (start with p=none to monitor, then tighten).`,
      }))
    }
    if (resend === 'unverified' || resend === 'not_found') {
      findings.push(finding(`email-resend-${resend === 'not_found' ? 'notfound' : 'unverified'}-${domain}`, 'high', domain, {
        title: `Resend domain ${resend === 'not_found' ? 'not registered' : 'not verified'}: ${domain}`,
        detail: `The platform sends via Resend from @${domain} addresses, but the Resend API reports this domain as ${resend === 'not_found' ? 'not added to the account' : 'added but not verified'}. Sends from it fail or are heavily penalized.`,
        recommendation: `In the Resend dashboard add/verify ${domain}, then create the DNS records it lists in the Vercel DNS panel.`,
      }))
    }
    if (resend === 'no_api_key') {
      findings.push(finding('email-resend-key-missing', 'medium', domain, {
        title: 'RESEND_API_KEY is not configured',
        detail: 'The outbound email helper (lib/email.ts) requires RESEND_API_KEY. Without it, every platform email — including approval and publish notifications — fails.',
        recommendation: 'Add RESEND_API_KEY to the Vercel project environment variables (all environments that send mail).',
      }))
    }
  }

  const score = scoreFromFindings(findings)
  return {
    generatedAt: new Date().toISOString(),
    domains,
    findings,
    score,
    summary: {
      domains: domains.length,
      canReceive: domains.filter(d => d.mx.length > 0).length,
      canAuthSend: domains.filter(d => d.spfCount === 1 && d.dkim).length,
      resendVerified: domains.filter(d => d.resend === 'verified').length,
    },
  }
}
