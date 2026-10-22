// saas/components/ApprovalPrompt.tsx
'use client'

import {
  APPROVAL_BODY, APPROVAL_BUTTON, APPROVAL_HINT, APPROVAL_TITLE, APPROVAL_WORD, assistanceCopy, type PendingApproval,
} from '@/lib/ai/cos/assistanceMode'

/**
 * Shown under the latest reply while a Builder job is waiting for the user (Work with me). The button sends the
 * approval word in the user's language through the chat's normal send, exactly as if they had typed it.
 */
export default function ApprovalPrompt({ approval, lang, disabled, onApprove }: {
  approval: PendingApproval
  lang: string
  disabled?: boolean
  onApprove: (message: string) => void
}) {
  const word = assistanceCopy(APPROVAL_WORD, lang)
  return (
    <div role="region" aria-label={assistanceCopy(APPROVAL_TITLE, lang)} data-approval-action={approval.action}
      style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)',
        background: 'rgba(255,195,0,.08)', textAlign: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: '#ffd666' }}>
        {/* Drawn, not an emoji: renders the same on every system font. */}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg>
        {assistanceCopy(APPROVAL_TITLE, lang)}
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.85)' }}>
        {assistanceCopy(APPROVAL_BODY[approval.action], lang)}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button type="button" disabled={disabled} onClick={() => onApprove(word)}
          style={{ padding: '8px 14px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13,
            background: disabled ? 'rgba(255,195,0,.35)' : '#ffc300', color: '#1a1300', cursor: disabled ? 'not-allowed' : 'pointer' }}>
          {assistanceCopy(APPROVAL_BUTTON[approval.action], lang)}
        </button>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{assistanceCopy(APPROVAL_HINT, lang).replace('{word}', word)}</span>
      </div>
    </div>
  )
}
