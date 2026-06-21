// saas/lib/audit/collectors.ts
// Server-only. Normalises live data from every configured provider into an
// AuditSnapshot. Each source is wrapped in try/catch so a missing or failing
// provider degrades gracefully — it never throws and never blocks the others.

import type { AuditSnapshot, NormalizedIdentity } from '@/lib/audit/findingsEngine'
import { listWorkspaceUsers } from '@/lib/auth/rbac-service'
import { scanAWSUsers, scanAWSAccessKeys } from '@/lib/hub/aws-scanner'

const PRIVILEGED_ROLE = /(owner|admin|root)/i

// ─────────────────────────────────────────────────────────────────────────────
// Hub workspace users → NormalizedIdentity[]
// ─────────────────────────────────────────────────────────────────────────────

async function collectHubIdentities(): Promise<NormalizedIdentity[]> {
  try {
    const result = await listWorkspaceUsers()
    if (!result.ok || !Array.isArray(result.users)) return []

    return result.users.map(u => {
      const identity: NormalizedIdentity = {
        provider: 'hub',
        principal: u.email,
        kind: 'user',
        role: u.role,
        isPrivileged: PRIVILEGED_ROLE.test(u.role || ''),
        mfaEnabled: typeof u.mfaEnabled === 'boolean' ? u.mfaEnabled : undefined,
        active: u.active,
        lastActivity: u.lastLogin || undefined,
        createdAt: u.createdAt || undefined,
      }
      return identity
    })
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS IAM users + access keys → NormalizedIdentity[]
// Only runs when AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are both set.
// ─────────────────────────────────────────────────────────────────────────────

async function collectAWSIdentities(): Promise<NormalizedIdentity[]> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!accessKeyId || !secretAccessKey) return []

  const identities: NormalizedIdentity[] = []

  // IAM users
  try {
    const usersResult = await scanAWSUsers(accessKeyId, secretAccessKey)
    if (usersResult.ok && Array.isArray(usersResult.users)) {
      for (const u of usersResult.users) {
        identities.push({
          provider: 'aws',
          principal: u.username,
          kind: 'user',
          role: 'iam-user',
          isPrivileged: false,
          mfaEnabled: undefined, // AWS ListUsers does not expose MFA state
          active: true,
          lastActivity: u.lastUsed ? u.lastUsed.toISOString() : undefined,
          createdAt: u.created ? u.created.toISOString() : undefined,
        })
      }
    }
  } catch {
    // degraded — continue
  }

  // Access keys
  try {
    const keysResult = await scanAWSAccessKeys(accessKeyId, secretAccessKey)
    if (keysResult.ok && Array.isArray(keysResult.keys)) {
      for (const k of keysResult.keys) {
        identities.push({
          provider: 'aws',
          principal: `${k.username}/${k.accessKeyId}`,
          kind: 'access_key',
          role: 'access-key',
          isPrivileged: false,
          mfaEnabled: undefined,
          active: k.status === 'Active',
          lastActivity: k.lastUsed ? k.lastUsed.toISOString() : undefined,
          createdAt: k.created ? k.created.toISOString() : undefined,
        })
      }
    }
  } catch {
    // degraded — continue
  }

  return identities
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function collectSnapshot(): Promise<AuditSnapshot> {
  const [hubIdentities, awsIdentities] = await Promise.all([
    collectHubIdentities(),
    collectAWSIdentities(),
  ])

  const identities: NormalizedIdentity[] = [...hubIdentities, ...awsIdentities]

  const snapshot: AuditSnapshot = {
    capturedAt: new Date().toISOString(),
    identities,
  }

  return snapshot
}
