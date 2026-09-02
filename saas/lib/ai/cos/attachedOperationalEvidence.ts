import { isOperationalLogEvidence } from './pastedOperationalLog.ts'

const MAX_ATTACHED_LOG_CHARS = 512_000
const TEXT_LOG_NAME = /\.(?:txt|log|md)$/i
const BASE64_TEXT_DATA = /^data:(?:text\/(?:plain|markdown)|application\/octet-stream)(?:;charset=[^;,]+)?;base64,([a-z0-9+/=]+)$/i

type Attachment = { name?: unknown; type?: unknown; mimeType?: unknown; dataUrl?: unknown }

export function readAttachedOperationalEvidence(attachments: unknown): string {
  if (!Array.isArray(attachments)) return ''
  for (const item of attachments.slice(0, 5) as Attachment[]) {
    const name = String(item?.name || '')
    const dataUrl = typeof item?.dataUrl === 'string' ? item.dataUrl : ''
    if (!TEXT_LOG_NAME.test(name) || dataUrl.length > MAX_ATTACHED_LOG_CHARS * 2) continue
    const encoded = dataUrl.match(BASE64_TEXT_DATA)?.[1]
    if (!encoded) continue
    try {
      const text = Buffer.from(encoded, 'base64').toString('utf8').slice(0, MAX_ATTACHED_LOG_CHARS)
      if (isOperationalLogEvidence(text)) return text
    } catch {
      // Ignore malformed attachments and preserve ordinary Concierge routing.
    }
  }
  return ''
}

