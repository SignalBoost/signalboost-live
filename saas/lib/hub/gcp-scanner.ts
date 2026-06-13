// saas/lib/hub/gcp-scanner.ts
// Scan GCP service accounts and keys

interface GCPServiceAccount {
  email: string
  projectId: string
  displayName?: string
  created: string
  disabled: boolean
}

interface GCPServiceAccountKey {
  name: string
  publicKeyData: string
  validAfterTime: string
  validBeforeTime: string
  disabled: boolean
}

/**
 * Scan GCP service accounts
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var with service account JSON
 */
export async function scanGCPServiceAccounts(projectId: string, serviceAccountKey: string): Promise<{
  ok: boolean
  accounts?: GCPServiceAccount[]
  error?: string
}> {
  try {
    // Parse service account key
    let credentials
    try {
      credentials = JSON.parse(serviceAccountKey)
    } catch {
      return { ok: false, error: 'Invalid service account key JSON' }
    }

    if (!credentials.project_id) {
      return { ok: false, error: 'Service account key missing project_id' }
    }

    // Get access token
    const tokenResponse = await getGCPAccessToken(credentials)
    if (!tokenResponse.ok || !tokenResponse.token) {
      return { ok: false, error: tokenResponse.error || 'Failed to get access token' }
    }

    const token = tokenResponse.token
    const projId = projectId || credentials.project_id

    // List service accounts
    const response = await fetch(
      `https://iam.googleapis.com/v1/projects/${projId}/serviceAccounts`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { ok: false, error: `GCP API error: ${error}` }
    }

    const data = await response.json()
    const accounts: GCPServiceAccount[] = (data.accounts || []).map((acc: any) => ({
      email: acc.email,
      projectId: acc.projectId,
      displayName: acc.displayName,
      created: acc.createTime,
      disabled: acc.disabled || false,
    }))

    return { ok: true, accounts }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `GCP scan failed: ${msg}` }
  }
}

/**
 * Scan GCP service account keys
 */
export async function scanGCPServiceAccountKeys(
  projectId: string,
  serviceAccountEmail: string,
  serviceAccountKey: string
): Promise<{
  ok: boolean
  keys?: GCPServiceAccountKey[]
  error?: string
}> {
  try {
    // Parse service account key
    let credentials
    try {
      credentials = JSON.parse(serviceAccountKey)
    } catch {
      return { ok: false, error: 'Invalid service account key JSON' }
    }

    // Get access token
    const tokenResponse = await getGCPAccessToken(credentials)
    if (!tokenResponse.ok || !tokenResponse.token) {
      return { ok: false, error: tokenResponse.error || 'Failed to get access token' }
    }

    const token = tokenResponse.token
    const projId = projectId || credentials.project_id

    // List keys for service account
    const response = await fetch(
      `https://iam.googleapis.com/v1/projects/${projId}/serviceAccounts/${serviceAccountEmail}/keys`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { ok: false, error: `GCP API error: ${error}` }
    }

    const data = await response.json()
    const keys: GCPServiceAccountKey[] = (data.keys || [])
      .filter((k: any) => k.keyType === 'USER_MANAGED') // Only user-managed keys
      .map((k: any) => ({
        name: k.name,
        publicKeyData: k.publicKeyData || '',
        validAfterTime: k.validAfterTime,
        validBeforeTime: k.validBeforeTime,
        disabled: k.disabled || false,
      }))

    return { ok: true, keys }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `GCP keys scan failed: ${msg}` }
  }
}

/**
 * Validate GCP credentials and get access token
 */
export async function validateGCPCredentials(serviceAccountKey: string): Promise<{
  ok: boolean
  projectId?: string
  error?: string
}> {
  try {
    let credentials
    try {
      credentials = JSON.parse(serviceAccountKey)
    } catch {
      return { ok: false, error: 'Invalid JSON' }
    }

    if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
      return { ok: false, error: 'Missing required fields: project_id, private_key, client_email' }
    }

    const tokenResponse = await getGCPAccessToken(credentials)
    if (!tokenResponse.ok) {
      return { ok: false, error: tokenResponse.error || 'Authentication failed' }
    }

    return { ok: true, projectId: credentials.project_id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Get GCP access token using service account key
 */
async function getGCPAccessToken(credentials: any): Promise<{
  ok: boolean
  token?: string
  error?: string
}> {
  try {
    // Create JWT
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }

    // Note: In production, use proper JWT signing library
    // For now, return error (requires crypto implementation)
    return {
      ok: false,
      error: 'JWT signing not implemented - use proper OAuth library in production',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token generation failed'
    return { ok: false, error: msg }
  }
}
