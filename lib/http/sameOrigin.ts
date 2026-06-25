// lib/http/sameOrigin.ts
//
// Origin/Referer allowlist check for cookie-authenticated, state-changing API
// routes (CSRF defense). State-changing browser fetches always send an Origin
// header, so a missing one is rejected. The candidate origin must match a
// configured canonical origin exactly (scheme + host + port); a single narrow
// fallback permits Vercel preview hosts over https. This is NOT "trust the Host
// header" — the fallback is gated to one trusted suffix and https only.
//
// Configure via APP_ALLOWED_ORIGINS (comma-separated) in the environment.

const CANONICAL_ORIGINS = (
  process.env.APP_ALLOWED_ORIGINS ||
  'https://signalboostapp.com,https://www.signalboostapp.com'
)
  .split(',')
  .map((entry) => {
    try {
      return new URL(entry.trim()).origin.toLowerCase()
    } catch {
      return ''
    }
  })
  .filter(Boolean)

export function sameOriginOk(req: Request): boolean {
  const candidate = req.headers.get('origin') || req.headers.get('referer')
  if (!candidate) return false // state-changing browser fetches always send Origin

  let candidateOrigin: string
  try {
    candidateOrigin = new URL(candidate).origin.toLowerCase()
  } catch {
    return false
  }

  if (CANONICAL_ORIGINS.includes(candidateOrigin)) return true

  const reqHost = (req.headers.get('host') || '').toLowerCase()
  if (reqHost.endsWith('.vercel.app') && candidateOrigin === `https://${reqHost}`) {
    return true
  }

  return false
}
