// saas/lib/hub/provider-templates-vercel-dns.ts
// Compatibility export: provider-templates.ts already imports VERCEL_DNS_TEMPLATES.
// Keep that public name, but source it from the complete Vercel console template set.

import { VERCEL_CONSOLE_TEMPLATES } from './provider-templates-vercel-console'

export const VERCEL_DNS_TEMPLATES = VERCEL_CONSOLE_TEMPLATES
