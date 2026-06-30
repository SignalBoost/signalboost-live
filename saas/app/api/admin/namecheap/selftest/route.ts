// saas/app/api/admin/namecheap/selftest/route.ts
// One-shot Namecheap diagnostic, owner-gated. Calls the REAL Namecheap API from
// the actual deployed environment (so we see Vercel's real outbound IP behavior
// and Namecheap's real response) instead of guessing. Open in the browser while
// logged in as owner:
//   /api/admin/namecheap/selftest
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const apiKey = process.env.NAMECHEAP_API_KEY
  const apiUser = process.env.NAMECHEAP_API_USER || process.env.NAMECHEAP_USERNAME
  const clientIp = process.env.NAMECHEAP_CLIENT_IP

  const out: Record<string, any> = {
    envConfigured: { apiKey: !!apiKey, apiUser: !!apiUser, clientIp: !!clientIp, clientIpValue: clientIp || null },
  }

  // Also report what IP this request is actually coming from, to compare against
  // whatever is whitelisted in Namecheap.
  out.vercelRequestHeaders = {
    xForwardedFor: _req.headers.get('x-forwarded-for'),
    xRealIp: _req.headers.get('x-real-ip'),
  }

  if (!apiKey || !apiUser || !clientIp) {
    out.result = 'not_configured'
    return NextResponse.json({ ok: true, ...out })
  }

  try {
    const url = `https://api.namecheap.com/xml.response?ApiUser=${encodeURIComponent(apiUser)}&ApiKey=${encodeURIComponent(apiKey)}&UserName=${encodeURIComponent(apiUser)}&ClientIp=${encodeURIComponent(clientIp)}&Command=namecheap.domains.getList`
    const res = await fetch(url)
    const xml = await res.text()
    out.httpStatus = res.status
    out.rawResponseSnippet = xml.slice(0, 1500)
    out.isError = xml.includes('Status="ERROR"')
    if (out.isError) {
      out.errorMessage = xml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1] || 'Unknown Namecheap error'
      out.errorNumber = xml.match(/Number="(\d+)"/)?.[1] || null
    }
    out.result = out.isError ? 'namecheap_rejected' : 'success'
  } catch (err) {
    out.result = 'fetch_failed'
    out.error = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({ ok: true, ...out })
}
