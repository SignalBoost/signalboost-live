// saas/next.config.mjs
// Canonical Next.js configuration. Keep one config file so Vercel, local builds,
// COS integrity checks, and output-file tracing all evaluate the same policy.

import path from 'node:path'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "media-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "form-action 'self' https:",
  'upgrade-insecure-requests',
].join('; ')

const PUBLIC_SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
]

// The public homepage is a same-origin application surface, not a cross-origin API.
// Do not advertise wildcard CORS there. The explicit canonical origin preserves ordinary
// same-origin browser behavior while removing an unnecessary wildcard trust signal.
// `Server` is set empty here as the application-level suppression attempt; Preview/Production
// verification remains authoritative because the hosting layer may add its own Server header.
const PUBLIC_ROOT_EXPOSURE_HEADERS = [
  { key: 'Access-Control-Allow-Origin', value: 'https://itmounts.com' },
  { key: 'Server', value: '' },
]

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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: PUBLIC_SECURITY_HEADERS,
      },
      {
        source: '/',
        headers: PUBLIC_ROOT_EXPOSURE_HEADERS,
      },
    ]
  },
}

export default nextConfig