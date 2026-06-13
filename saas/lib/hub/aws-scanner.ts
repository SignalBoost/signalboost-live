// saas/lib/hub/aws-scanner.ts
// Scan AWS IAM users and access keys using AWS API (no SDK dependency)

import { createHmac } from 'crypto'

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
}

/**
 * AWS Signature V4 signer
 */
function signRequest(
  method: string,
  host: string,
  path: string,
  query: string,
  accessKey: string,
  secretKey: string,
  payload: string = ''
): { headers: Record<string, string> } {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'us-east-1'
  const service = 'iam'
  const algorithm = 'AWS4-HMAC-SHA256'

  // Canonical request
  const hashedPayload = createHmac('sha256', '').update(payload).digest('hex')
  const canonicalRequest = [method, path, query, `host:${host}\nx-amz-date:${amzDate}\n`, 'host;x-amz-date', hashedPayload].join('\n')

  // String to sign
  const hashedCanonicalRequest = createHmac('sha256', '').update(canonicalRequest).digest('hex')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [algorithm, amzDate, credentialScope, hashedCanonicalRequest].join('\n')

  // Signature
  const kDate = createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest()
  const kRegion = createHmac('sha256', kDate).update(region).digest()
  const kService = createHmac('sha256', kRegion).update(service).digest()
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  const authHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=host;x-amz-date, Signature=${signature}`

  return {
    headers: {
      Host: host,
      'X-Amz-Date': amzDate,
      Authorization: authHeader,
    },
  }
}

/**
 * Scan AWS IAM users
 */
export async function scanAWSUsers(
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  ok: boolean
  users?: AWSUser[]
  error?: string
}> {
  try {
    const host = 'iam.amazonaws.com'
    const path = '/'
    const query = 'Action=ListUsers&Version=2010-05-08'

    const signed = signRequest('POST', host, path, query, accessKeyId, secretAccessKey)

    const response = await fetch(`https://${host}${path}?${query}`, {
      method: 'POST',
      headers: signed.headers,
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, error: `AWS API error: ${text}` }
    }

    const text = await response.text()
    // Parse XML response (simplified - extract user entries)
    const userMatches = text.match(/<User>.*?<\/User>/gs) || []
    const users: AWSUser[] = userMatches.map(xml => {
      const usernameMatch = xml.match(/<UserName>(.*?)<\/UserName>/)
      const arnMatch = xml.match(/<Arn>(.*?)<\/Arn>/)
      const createDateMatch = xml.match(/<CreateDate>(.*?)<\/CreateDate>/)

      return {
        username: usernameMatch?.[1] || 'unknown',
        arn: arnMatch?.[1] || '',
        created: createDateMatch ? new Date(createDateMatch[1]) : new Date(),
      }
    })

    return { ok: true, users }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `AWS scan failed: ${msg}` }
  }
}

/**
 * Scan AWS access keys
 */
export async function scanAWSAccessKeys(
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  ok: boolean
  keys?: AWSAccessKey[]
  error?: string
}> {
  try {
    const host = 'iam.amazonaws.com'
    const path = '/'
    const query = 'Action=GetCredentialReport&Version=2010-05-08'

    const signed = signRequest('POST', host, path, query, accessKeyId, secretAccessKey)

    const response = await fetch(`https://${host}${path}?${query}`, {
      method: 'POST',
      headers: signed.headers,
    })

    if (!response.ok) {
      return {
        ok: false,
        error: 'Failed to fetch credential report - ensure credentials have IAM permissions',
      }
    }

    const text = await response.text()
    // Parse CSV response (simplified)
    const lines = text.split('\n')
    const keys: AWSAccessKey[] = []

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      if (parts.length > 3) {
        keys.push({
          accessKeyId: parts[0]?.trim() || 'unknown',
          username: parts[1]?.trim() || 'unknown',
          status: (parts[3]?.trim() === 'true' ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
          created: new Date(parts[4]?.trim() || ''),
        })
      }
    }

    return { ok: true, keys }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `AWS keys scan failed: ${msg}` }
  }
}

/**
 * Validate AWS credentials
 */
export async function validateAWSCredentials(
  accessKeyId: string,
  secretAccessKey: string
): Promise<{
  ok: boolean
  accountId?: string
  error?: string
}> {
  try {
    const host = 'iam.amazonaws.com'
    const path = '/'
    const query = 'Action=GetUser&Version=2010-05-08'

    const signed = signRequest('POST', host, path, query, accessKeyId, secretAccessKey)

    const response = await fetch(`https://${host}${path}?${query}`, {
      method: 'POST',
      headers: signed.headers,
    })

    if (!response.ok) {
      return { ok: false, error: 'Invalid AWS credentials' }
    }

    const text = await response.text()
    const arnMatch = text.match(/<Arn>(.*?)<\/Arn>/)
    const arn = arnMatch?.[1]
    const accountId = arn?.split(':')[4]

    return { ok: true, accountId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid credentials'
    return { ok: false, error: msg }
  }
}
