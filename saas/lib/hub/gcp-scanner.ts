// saas/lib/hub/gcp-scanner.ts
// Scan GCP service accounts and keys using JWT authentication

import { getGCPAccessToken, validateGCPKeyFormat } from '@/lib/auth/gcp-jwt'

export interface GCPServiceAccount {
  email: string
  projectId: string
  displayName?: string
  created: string
  disabled: boolean
}

export interface GCPServiceAccountKey {
  name: string
  publicKeyData: string
  validAfterTime: string
  validBeforeTime: string
  disabled: boolean
}

/**
 * Scan GCP service accounts
 */
export async function scanGCPServiceAccounts(
  projectId: string,
  serviceAccountKey: string
): Promise<{
  ok: boolean
  accounts?: GCPServiceAccount[]
  error?: string
}> {
  try {
    // Validate key format
    const validation = validateGCPKeyFormat(serviceAccountKey)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    // Get access token
    const tokenResponse = await getGCPAccessToken(serviceAccountKey)
    if (!tokenResponse.ok || !tokenResponse.token) {
      return { ok: false, error: tokenResponse.error || 'Failed to get access token' }
    }

    const token = tokenResponse.token
    const projId = projectId || validation.projectId

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
      return { ok: false, error: `GCP API error: ${response.status} ${error}` }
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
    // Validate key format
    const validation = validateGCPKeyFormat(serviceAccountKey)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    // Get access token
    const tokenResponse = await getGCPAccessToken(serviceAccountKey)
    if (!tokenResponse.ok || !tokenResponse.token) {
      return { ok: false, error: tokenResponse.error || 'Failed to get access token' }
    }

    const token = tokenResponse.token
    const projId = projectId || validation.projectId

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
      return { ok: false, error: `GCP API error: ${response.status} ${error}` }
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
 * Validate GCP credentials and get project ID
 */
export async function validateGCPCredentials(serviceAccountKey: string): Promise<{
  ok: boolean
  projectId?: string
  email?: string
  error?: string
}> {
  try {
    // Validate key format first
    const validation = validateGCPKeyFormat(serviceAccountKey)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    // Try to get access token
    const tokenResponse = await getGCPAccessToken(serviceAccountKey)
    if (!tokenResponse.ok) {
      return { ok: false, error: tokenResponse.error || 'Authentication failed' }
    }

    return {
      ok: true,
      projectId: validation.projectId,
      email: validation.email,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
