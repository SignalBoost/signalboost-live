'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const GOLD = '#ffc300'

type ReviewState = 'pending' | 'approved' | 'revision'

export default function LocalVideoPreviewReview() {
  const [state, setState] = useState<ReviewState>('pending')
  const { t } = useTranslation()
  const reviewMessage = state === 'approved'
    ? t('studioPreview.status.approved', uiCopy('u_0e2ba8be3b109945'))
    : state === 'revision'
      ? t('studioPreview.status.revision', uiCopy('u_0f8b8e909619f442'))
      : t('studioPreview.status.pending', uiCopy('u_e7f51f04361efb72'))

  return (
    <section style={card} aria-label={t('studioPreview.ariaLabel', uiCopy('u_1c0ea6043619e641'))}>
      <div>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{t('studioPreview.kicker', uiCopy('u_5fe35795ea32c788'))}</p>
        <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{t('studioPreview.title', uiCopy('u_3ef75cac29a74eb6'))}</h2>
        <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.65, margin: '8px 0 0', maxWidth: 760 }}>
          {t('studioPreview.description', uiCopy('u_ac39595d50b7ae30'))}
        </p>
        <p style={{ color: GOLD, fontWeight: 900, margin: '10px 0 0' }}>{reviewMessage}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => setState('approved')} style={primaryButton}>{t('studioPreview.actions.approve', uiCopy('u_6e4c4df60e9ef664'))}</button>
        <button type="button" onClick={() => setState('revision')} style={secondaryButton}>{t('studioPreview.actions.revision', uiCopy('u_749775a1f862d034'))}</button>
      </div>
    </section>
  )
}

const card: React.CSSProperties = { border: '1px solid rgba(26,240,255,.22)', borderRadius: 22, padding: 18, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))', backdropFilter: 'blur(18px)', boxShadow: '0 24px 70px rgba(0,0,0,.35)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'center' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
