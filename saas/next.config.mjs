// saas/next.config.mjs
// Canonical Next.js configuration. Keep one config file so Vercel, local builds,
// COS integrity checks, and output-file tracing all evaluate the same policy.

import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  // Vercel builds from `saas`, while the protected approved COS snapshot lives at
  // repository root. Expand the trace root only far enough to include that exact
  // governance snapshot, then bind it explicitly to the Concierge route.
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  outputFileTracingIncludes: {
    '/api/concierge': ['../cos-core/brain.md'],
  },
}

export default nextConfig
