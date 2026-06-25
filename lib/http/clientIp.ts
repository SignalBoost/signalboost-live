// lib/http/clientIp.ts
//
// Derive a rate-limit bucket from forwarded headers, but only trust a value
// that actually looks like an IP and is bounded in length — so a spoofed or
// oversized header can't inject huge/arbitrary key material into the limiter.
// Anything else buckets together under 'unknown'.
//
// NOTE: forwarded headers are only as trustworthy as the edge that sets them.
// On a platform that overwrites x-forwarded-for at the proxy (e.g. Vercel) this
// is the real client IP; where that guarantee is weaker, treat per-IP limits as
// best-effort and lean on the coarse global cap and edge/WAF controls.

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:]{2,45}$/

export function clientIpKey(req: Request): string {
  const raw =
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    (req.headers.get('x-real-ip') || '').trim()
  if (raw.length <= 45 && (IPV4.test(raw) || IPV6.test(raw))) return raw
  return 'unknown'
}
