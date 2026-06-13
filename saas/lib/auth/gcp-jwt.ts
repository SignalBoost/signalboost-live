// saas/lib/auth/gcp-jwt.ts
// GCP JWT signing for service account authentication (no external deps)

import { createSign } from 'crypto'

export interface GCPServiceAccountKey {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
}

/**
 * Sign JWT using RS256 (RSA SHA-256)
 */
function signJWT(header: Record<string, string>, payload: Record<string, unknown>, privateKey: string): string {
  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64').replace(/[+/=]/g, c => ({
    '+': '-',
    '/': '_',
    '=': '',
  }[c] || c))

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/[+/=]/g, c => ({
    '+': '-',
    '/': '_',
    '=': '',
  }[c] || c))

  const message = `${encodedHeader}.${encodedPayload}`

  // Sign with private key
  const signer = createSign('RSA-SHA256')
  signer.update(message)
  signer.end()

  const signature = signer
    .sign(privateKey, 'base64')
    .replace(/[+/=]/g, c => ({
      '+': '-',
      '/': '_',
      '=': '',
    }[c] || c))

  return `${message}.${signature}`
}

/**
 * Get GCP access token using service account key
 */
export async function getGCPAccessToken(serviceAccountKey: string): Promise<{
  ok: boolean
  token?: string
  expiresIn?: number
  error?: string
}> {
  try {
    // Parse service account key
    let credentials: GCPServiceAccountKey
    try {
      credentials = JSON.parse(serviceAccountKey)
    } catch {
      return { ok: false, error: 'Invalid service account key JSON' }
    }

    // Validate required fields
    if (!credentials.private_key || !credentials.client_email || !credentials.token_uri) {
      return { ok: false, error: 'Missing required fields: private_key, client_email, token_uri' }
    }

    // Create JWT
    const now = Math.floor(Date.now() / 1000)
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    }

    const payload = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: credentials.token_uri,
      exp: now + 3600,
      iat: now,
    }

    const jwt = signJWT(header, payload, credentials.private_key)

    // Exchange JWT for access token
    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      return { ok: false, error: `Token request failed: ${error}` }
    }

    const data = await tokenResponse.json()

    return {
      ok: true,
      token: data.access_token,
      expiresIn: data.expires_in,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token generation failed'
    return { ok: false, error: msg }
  }
}

/**
 * Validate GCP service account key format
 */
export function validateGCPKeyFormat(serviceAccountKey: string): {
  ok: boolean
  projectId?: string
  email?: string
  error?: string
} {
  try {
    const credentials = JSON.parse(serviceAccountKey)

    if (!credentials.project_id) {
      return { ok: false, error: 'Missing project_id' }
    }
    if (!credentials.private_key) {
      return { ok: false, error: 'Missing private_key' }
    }
    if (!credentials.client_email) {
      return { ok: false, error: 'Missing client_email' }
    }
    if (!credentials.token_uri) {
      return { ok: false, error: 'Missing token_uri' }
    }

    return {
      ok: true,
      projectId: credentials.project_id,
      email: credentials.client_email,
    }
  } catch (err) {
    return { ok: false, error: 'Invalid JSON format' }
  }
}
