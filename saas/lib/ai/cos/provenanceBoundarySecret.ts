// Shared secret for the internal browser-provenance boundary and public answer capsule signing.
// A dedicated key is preferred. Existing high-entropy server-only secrets are safe fallbacks so the
// public trial path can fail closed rather than shipping unsigned provenance when no dedicated key
// has been provisioned yet.
export function provenanceBoundarySecret(): string | null {
  return process.env.COS_PROVENANCE_SIGNING_KEY?.trim()
    || process.env.COS_TURN_EXPERIENCE_HASH_KEY?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.CRON_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || null
}
