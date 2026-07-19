'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

const GOLD = '#ffc300'

type ReviewState = 'pending' | 'approved' | 'revision'

export default function LocalVideoPreviewReview() {
  const [state, setState] = useState<ReviewState>('pending')
  const { t } = useTranslation()
  const reviewMessage = state === 'approved'
    ? t('studioPreview.status.approved', 'Approved for the next Studio step.')
    : state === 'revision'
      ? t('studioPreview.status.revision', 'Held for revision in Studio.')
      : t('studioPreview.status.pending', 'Waiting for local Studio review.')

  return (
    <section style={card} aria-label={t('studioPreview.ariaLabel', 'Studio video preview review')}>
      <div>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{t('studioPreview.kicker', 'Studio preview review')}</p>
        <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{t('studioPreview.title', 'Review this COS video preview here')}</h2>
        <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.65, margin: '8px 0 0', maxWidth: 760 }}>
          {t('studioPreview.description', 'Video preview decisions stay inside the Studio workflow, close to the generated asset.')}
        </p>
        <p style={{ color: GOLD, fontWeight: 900, margin: '10px 0 0' }}>{reviewMessage}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => setState('approved')} style={primaryButton}>{t('studioPreview.actions.approve', 'Approve preview')}</button>
        <button type="button" onClick={() => setState('revision')} style={secondaryButton}>{t('studioPreview.actions.revision', 'Hold for revision')}</button>
      </div>
    </section>
  )
}

const card: React.CSSProperties = { border: '1px solid rgba(26,240,255,.22)', borderRadius: 22, padding: 18, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))', backdropFilter: 'blur(18px)', boxShadow: '0 24px 70px rgba(0,0,0,.35)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'center' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
