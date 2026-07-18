// saas/app/api/agency/provider-keys/route.ts
// Thin App Router entrypoint. The canonical encrypted BYOK vault lives under lib.

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export { GET, POST, DELETE } from '@/lib/agency/provider-keys/route'
