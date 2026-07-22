use client'

// saas/app/dashboard/marketing/press-providers/page.tsx
// Press & Media Provider Cockpit — mirrors the Social Outreach Connector Cockpit layout
// (/dashboard/outreach/social). Reads providers from the press-media registry (live vs coming)
// and drives them via /api/agency/press-media. Fully localized in the platform's five
// languages (EN/ES/PT/PL/RU) through useI18n() — provider labels and blurbs included, so the
// API's English roadmap text is never shown to a non-English operator.

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import PressProviderConnectForm from './PressProviderConnectForm'

type Provider = { id: string; label: string; type: string; cost: string; proof: string; needs: string[]; blurb: string; live: boolean; registered?: boolean }
type Campaign = {
  id: string; status: string; media_target_type: string; headline?: string | null; publication_name?: string | null
  editor_contact?: string | null; publication_contact?: string | null; cta_url?: string | null; published_url?: string | null
  source?: string | null; updated_at?: string | null
}
type Cockpit = { ok: boolean; providers: Provider[]; summary: { total: number; live: number; coming: number }; campaigns: Campaign[]; error?: string }
type Note = { text: string; ok: boolean } | null

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }
const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box' }
