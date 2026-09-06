import { getValidGoogleWorkspaceToken } from './token-store.ts'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type GmailMessageSummary = {
  id: string
  threadId: string
  from: string
  subject: string
  date: string
  internalDate: string | null
  snippet: string
  labels: string[]
}

function text(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

type GmailJsonResult = { ok: true; data: any } | { ok: false; reason: string }

async function gmailJson(userId: string, path: string, fetchImpl: typeof fetch = fetch): Promise<GmailJsonResult> {
  const token = await getValidGoogleWorkspaceToken(userId)
  if ('reason' in token) return { ok: false as const, reason: token.reason }
  try {
    const response = await fetchImpl(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    const raw = await response.text()
    if (!response.ok) return { ok: false as const, reason: `Gmail request failed (${response.status}): ${raw.slice(0, 180)}` }
    return { ok: true as const, data: JSON.parse(raw) }
  } catch (error) {
    return { ok: false as const, reason: `Gmail request failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function header(payload: any, name: string): string {
  const found = (Array.isArray(payload?.headers) ? payload.headers : [])
    .find((item: any) => String(item?.name || '').toLowerCase() === name.toLowerCase())
  return text(found?.value, name === 'Subject' ? 500 : 320)
}

export async function listRecentGmailMessages(
  userId: string,
  options: { query?: string; limit?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; messages: GmailMessageSummary[] } | { ok: false; reason: string }> {
  const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 25)))
  const query = text(options.query || 'newer_than:2d', 300)
  const listed = await gmailJson(userId, `/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`, fetchImpl)
  if ('reason' in listed) return listed
  const refs = Array.isArray(listed.data?.messages) ? listed.data.messages.slice(0, limit) : []
  const messages: GmailMessageSummary[] = []
  for (const ref of refs) {
    const id = text(ref?.id, 200)
    if (!id) continue
    const params = new URLSearchParams({ format: 'metadata' })
    for (const value of ['From', 'Subject', 'Date']) params.append('metadataHeaders', value)
    const result = await gmailJson(userId, `/messages/${encodeURIComponent(id)}?${params.toString()}`, fetchImpl)
    if ('reason' in result) return result
    messages.push({
      id,
      threadId: text(result.data?.threadId, 200),
      from: header(result.data?.payload, 'From'),
      subject: header(result.data?.payload, 'Subject') || '(no subject)',
      date: header(result.data?.payload, 'Date'),
      internalDate: result.data?.internalDate ? new Date(Number(result.data.internalDate)).toISOString() : null,
      snippet: text(result.data?.snippet, 500),
      labels: Array.isArray(result.data?.labelIds) ? result.data.labelIds.map((item: unknown) => text(item, 80)).filter(Boolean) : [],
    })
  }
  return { ok: true as const, messages }
}
