// saas/lib/auth/ownerEmails.ts
// ONE definition of "who is the owner", shared by authorization and billing.
//
// These used to be two separate lists. lib/auth/access.ts carried a hard-coded
// default so the primary owner keeps access even when deployment configuration
// is missing, while lib/credits.ts read OWNER_EMAILS/ADMIN_EMAILS only. With
// OWNER_EMAILS unset, the same person was recognized as owner for authorization
// and charged credits as an ordinary user. This module removes that split.
//
// Zero imports on purpose: billing helpers run outside the request scope and
// must not pull in next/headers.

const DEFAULT_OWNER_EMAILS = ['cadomos@gmail.com']

export function ownerEmailEnvList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)
}

/** Owner accounts: the built-in primary owner plus anything in OWNER_EMAILS. */
export function ownerEmailList(): string[] {
  return [...new Set([...DEFAULT_OWNER_EMAILS, ...ownerEmailEnvList('OWNER_EMAILS')])]
}

export function isOwnerEmail(value: string | null | undefined): boolean {
  const email = String(value || '').trim().toLowerCase()
  return Boolean(email) && ownerEmailList().includes(email)
}

/**
 * Accounts exempt from credit metering: every owner, plus ADMIN_EMAILS.
 * The platform must never bill itself for using its own product.
 */
export function isCreditExemptEmail(value: string | null | undefined): boolean {
  const email = String(value || '').trim().toLowerCase()
  if (!email) return false
  return ownerEmailList().includes(email) || ownerEmailEnvList('ADMIN_EMAILS').includes(email)
}
