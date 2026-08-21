// saas/lib/hub/provider-templates-vercel-dns.ts
// Compatibility export: provider-templates.ts already imports VERCEL_DNS_TEMPLATES.
// Keep that public name, source the Vercel templates from the complete console
// set, and merge the small cross-provider templates that must be registered
// without expanding the central provider-templates.ts file.

import { VERCEL_CONSOLE_TEMPLATES } from './provider-templates-vercel-console.ts'
import { PARTNER_TEMPLATES } from './provider-templates-partners.ts'

export const VERCEL_DNS_TEMPLATES = {
  ...VERCEL_CONSOLE_TEMPLATES,
  ...PARTNER_TEMPLATES,
}
