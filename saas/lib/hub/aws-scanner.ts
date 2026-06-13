// saas/lib/hub/aws-scanner.ts
// Scan AWS IAM users and access keys

import { IAMClient, ListUsersCommand, ListAccessKeysCommand, GetAccessKeyLastUsedCommand } from '@aws-sdk/client-iam'

export interface AWSUser {
  username: string
  arn: string
  created: Date
  lastUsed?: Date
}

export interface AWSAccessKey {
  accessKeyId: string
  username: string
  status: 'Active' | 'Inactive'
  created: Date
  lastUsed?: Date
  lastUsedRegion?: string
  lastUsedService?: string
}

/**
 * Scan AWS IAM users
 */
export async function scanAWSUsers(accessKeyId: string, secretAccessKey: string): Promise<{
  ok: boolean
  users?: AWSUser[]
  error?: string
}> {
  try {
    const client = new IAMClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    const command = new ListUsersCommand({})
    const response = await client.send(command)

    const users: AWSUser[] = (response.Users || []).map(user => ({
      username: user.UserName!,
      arn: user.Arn!,
      created: user.CreateDate!,
      lastUsed: undefined, // Would need additional calls
    }))

    client.destroy()
    return { ok: true, users }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `AWS scan failed: ${msg}` }
  }
}

/**
 * Scan AWS access keys
 */
export async function scanAWSAccessKeys(accessKeyId: string, secretAccessKey: string): Promise<{
  ok: boolean
  keys?: AWSAccessKey[]
  error?: string
}> {
  try {
    const client = new IAMClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    // Get all users first
    const usersCmd = new ListUsersCommand({})
    const usersResp = await client.send(usersCmd)

    const allKeys: AWSAccessKey[] = []

    // Get access keys for each user
    for (const user of usersResp.Users || []) {
      const keysCmd = new ListAccessKeysCommand({ UserName: user.UserName })
      const keysResp = await client.send(keysCmd)

      for (const key of keysResp.AccessKeyMetadata || []) {
        // Get last used info
        let lastUsed: Date | undefined
        let lastUsedRegion: string | undefined
        let lastUsedService: string | undefined

        try {
          const lastUsedCmd = new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId! })
          const lastUsedResp = await client.send(lastUsedCmd)

          if (lastUsedResp.AccessKeyLastUsed) {
            lastUsed = lastUsedResp.AccessKeyLastUsed.LastUsedDate
            lastUsedRegion = lastUsedResp.AccessKeyLastUsed.Region
            lastUsedService = lastUsedResp.AccessKeyLastUsed.ServiceName
          }
        } catch (err) {
          // Ignore if we can't get last used info
        }

        allKeys.push({
          accessKeyId: key.AccessKeyId!,
          username: user.UserName!,
          status: key.Status as 'Active' | 'Inactive',
          created: key.CreateDate!,
          lastUsed,
          lastUsedRegion,
          lastUsedService,
        })
      }
    }

    client.destroy()
    return { ok: true, keys: allKeys }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `AWS access key scan failed: ${msg}` }
  }
}

/**
 * Check AWS credentials validity
 */
export async function validateAWSCredentials(accessKeyId: string, secretAccessKey: string): Promise<{
  ok: boolean
  accountId?: string
  error?: string
}> {
  try {
    const client = new IAMClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    // Try to list users (basic validation)
    const cmd = new ListUsersCommand({ MaxItems: 1 })
    const response = await client.send(cmd)

    // Extract account ID from ARN if available
    const firstUser = response.Users?.[0]
    const arn = firstUser?.Arn
    const accountId = arn?.split(':')[4] || undefined

    client.destroy()
    return { ok: true, accountId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid credentials'
    return { ok: false, error: msg }
  }
}
