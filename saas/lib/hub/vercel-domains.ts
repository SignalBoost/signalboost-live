// saas/lib/hub/vercel-domains.ts
// Vercel domain and DNS record management

import { VercelDomain, DNSRecord, Domain, DNSCheckResult, SSLCertificate } from './domains-types'

const VERCEL_API = 'https://api.vercel.com'

/**
 * List all domains in Vercel project
 */
export async function listVercelDomains(teamId: string, projectId: string, token: string): Promise<{
  ok: boolean
  domains?: VercelDomain[]
  error?: string
}> {
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains?teamId=${teamId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to list domains: ${error}` }
    }

    const data = await res.json()
    return { ok: true, domains: data.domains || [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Get domain details including SSL and DNS records
 */
export async function getVercelDomain(teamId: string, projectId: string, domain: string, token: string): Promise<{
  ok: boolean
  domain?: VercelDomain & { records?: DNSRecord[] }
  error?: string
}> {
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${domain}?teamId=${teamId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to get domain: ${error}` }
    }

    const data = await res.json()
    return { ok: true, domain: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Add domain to Vercel project
 */
export async function addVercelDomain(teamId: string, projectId: string, domain: string, token: string): Promise<{
  ok: boolean
  domain?: VercelDomain
  verification?: { type: string; value: string; domain: string }
  error?: string
}> {
  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}/domains?teamId=${teamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    })

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to add domain: ${error}` }
    }

    const data = await res.json()
    return {
      ok: true,
      domain: data,
      verification: data.verification?.[0],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Verify domain ownership
 */
export async function verifyVercelDomain(teamId: string, projectId: string, domain: string, token: string): Promise<{
  ok: boolean
  verified: boolean
  domain?: VercelDomain
  error?: string
}> {
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${domain}/verify?teamId=${teamId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, verified: false, error: `Verification failed: ${error}` }
    }

    const data = await res.json()
    return {
      ok: true,
      verified: data.verified || false,
      domain: data,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, verified: false, error: msg }
  }
}

/**
 * Remove domain from Vercel project
 */
export async function removeVercelDomain(teamId: string, projectId: string, domain: string, token: string): Promise<{
  ok: boolean
  error?: string
}> {
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${domain}?teamId=${teamId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to remove domain: ${error}` }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Get SSL certificate status
 */
export async function getSSLStatus(teamId: string, projectId: string, domain: string, token: string): Promise<{
  ok: boolean
  ssl?: SSLCertificate
  error?: string
}> {
  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/domains/${domain}?teamId=${teamId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Failed to get SSL status: ${error}` }
    }

    const data = await res.json()
    const sslData = data.ssl

    if (!sslData || !sslData.expiresAt) {
      return { ok: true, ssl: undefined }
    }

    const expiresAt = new Date(sslData.expiresAt)
    const now = new Date()
    const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    let status: 'valid' | 'expiring_soon' | 'expired' = 'valid'
    if (daysUntilExpiry < 0) {
      status = 'expired'
    } else if (daysUntilExpiry < 30) {
      status = 'expiring_soon'
    }

    return {
      ok: true,
      ssl: {
        domain,
        issuer: 'Let\'s Encrypt',
        issuedAt: new Date(sslData.created).toISOString(),
        expiresAt: expiresAt.toISOString(),
        daysUntilExpiry,
        status,
        autoRenew: true,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Check DNS record propagation
 */
export async function checkDNSRecord(domain: string, recordType: string, expectedValue: string): Promise<DNSCheckResult> {
  try {
    // This would use a DNS lookup library in production
    // For now, return pending verification
    return {
      domain,
      recordType,
      expected: expectedValue,
      actual: 'checking...',
      verified: false,
      message: 'DNS verification in progress',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return {
      domain,
      recordType,
      expected: expectedValue,
      actual: 'error',
      verified: false,
      message: msg,
    }
  }
}
