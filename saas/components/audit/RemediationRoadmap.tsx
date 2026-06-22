'use client'

// saas/components/audit/RemediationRoadmap.tsx
// Remediation Roadmap — presentational + triage. Now / Next / Later tiers and an
// evidence track, plus per-finding state (status + owner) overlaid from
// audit_finding_state. Handled findings (resolved / accepted / won't-fix) drop
// out of the active queue into a separate Handled section. Every label resolves
// through t('audit.*'); each finding's text is resolved in the active language.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import { resolveFinding, type Finding, type AuditScore, type Severity } from '@/lib/audit/reportModel'
import { FINDING_STATUSES, isHandled, normalizeStatus, type FindingStateMap } from '@/lib/audit/findingState'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const RED = '#fca5a5'
const ORANGE = '#fb923c'
const GREEN = '#86efac'
const GREY = 'rgba(255,255,255,.45)'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}
const SEV_COLOR: Record<Severity, string> = { critical: RED, high: ORANGE, medium: GOLD, low: CYAN, info: GREY }
const TIER_COLOR: Record<string, string> = { now: RED, next: ORANGE, later: CYAN }

type Tier = 'now' | 'next' | 'later'
export type RemediationEntryView = { finding: Finding; tier: Tier }
export type RemediationRoadmapView = {
  generatedAt: string
  items: RemediationEntryView[]
  evidence: Finding[]
  score: AuditScore
  summary: { now: number; next: number; later: number; evidence: number; total: number }
}

type StatePatch = { status?: string; owner?: string }

export default function RemediationRoadmap({
  data,
  states = {},
  onChange,
}: {
  data: RemediationRoadmapView
  states?: FindingStateMap
  onChange?: (findingId: string, patch: StatePatch) => void
}) {
  const { t } = useTranslation()
  const tiers: Tier[] = ['now', 'next', 'later']

  const statusOf = (f: Finding) => normalizeStatus(states[f.id]?.status || f.status)
  const ownerOf = (f: Finding) => states[f.id]?.owner || ''

  // Active (unhandled) vs handled split across both the fix queue and evidence.
  const allFindings: Finding[] = [...data.items.map(i => i.finding), ...data.evidence]
  const handled = allFindings.filter(f => isHandled(statusOf(f)))

  const activeCount = (tier: Tier) => data.items.filter(i => i.tier === tier && !isHandled(statusOf(i.finding))).length
  const evidenceActive = data.evidence.filter(f => !isHandled(statusOf(f)))

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.remediation.title', 'Remediation Roadmap')} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 660, lineHeight: 1.5 }}>
          {t('audit.remediation.subtitle', 'Prioritized fixes sequenced by urgency, with the items that need manual evidence on a separate track.')}
        </p>
      </div>

      <section style={{ ...glass, padding: 20, marginBottom: 16, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <Stat label={t('audit.remediation.summary.now', 'Now')} value={activeCount('now')} color={activeCount('now') ? RED : undefined} />
        <Stat label={t('audit.remediation.summary.next', 'Next')} value={activeCount('next')} color={activeCount('next') ? ORANGE : undefined} />
        <Stat label={t('audit.remediation.summary.later', 'Later')} value={activeCount('later')} color={activeCount('later') ? CYAN : undefined} />
        <Stat label={t('audit.remediation.summary.evidence', 'Evidence')} value={evidenceActive.length} />
        <Stat label={t('audit.remediation.summary.handled', 'Handled')} value={handled.length} color={handled.length ? GREEN : undefined} />
      </section>

      {data.items.length === 0 && data.evidence.length === 0 && (
        <section style={{ ...glass, padding: 20 }}>
          <div style={{ fontSize: 13, color: GREEN }}>{t('audit.remediation.empty', 'Nothing to remediate — no open findings.')}</div>
        </section>
      )}

      {tiers.map(tier => {
        const entries = data.items.filter(i => i.tier === tier && !isHandled(statusOf(i.finding)))
        if (entries.length === 0) return null
        const c = TIER_COLOR[tier]
        return (
          <section key={tier} style={{ ...glass, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: c }}>
                {t(`audit.remediation.tier.${tier}`, tier)}
              </span>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>{t(`audit.remediation.tierHint.${tier}`, '')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {entries.map(({ finding }) => (
                <FixCard key={finding.id} finding={finding} t={t} status={statusOf(finding)} owner={ownerOf(finding)} onChange={onChange} />
              ))}
            </div>
          </section>
        )
      })}

      {evidenceActive.length > 0 && (
        <section style={{ ...glass, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: CYAN, marginBottom: 4 }}>
            {t('audit.remediation.evidenceTitle', 'Evidence Required')}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>
            {t('audit.remediation.evidenceSubtitle', 'Gaps to confirm with manual evidence. These do not lower the score.')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {evidenceActive.map(finding => (
              <FixCard key={finding.id} finding={finding} t={t} status={statusOf(finding)} owner={ownerOf(finding)} onChange={onChange} evidence />
            ))}
          </div>
        </section>
      )}

      {handled.length > 0 && (
        <section style={{ ...glass, padding: 20, opacity: 0.85 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: GREEN, marginBottom: 4 }}>
            {t('audit.remediation.handled.title', 'Handled')}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>
            {t('audit.remediation.handled.subtitle', "Findings you've marked resolved, accepted, or won't-fix.")}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {handled.map(finding => (
              <FixCard key={finding.id} finding={finding} t={t} status={statusOf(finding)} owner={ownerOf(finding)} onChange={onChange} muted />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || '#fff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{label}</div>
    </div>
  )
}

type TFn = (key: string, fallback: string) => string

function FixCard({
  finding, t, status, owner, onChange, evidence, muted,
}: {
  finding: Finding; t: TFn; status: string; owner: string
  onChange?: (findingId: string, patch: StatePatch) => void
  evidence?: boolean; muted?: boolean
}) {
  const text = resolveFinding(finding, t, interpolate)
  const color = SEV_COLOR[finding.severity]
  const [ownerDraft, setOwnerDraft] = useState(owner)

  const selectStyle: CSSProperties = {
    background: 'rgba(10,14,23,.8)', color: '#fff', border: '1px solid rgba(255,255,255,.18)',
    borderRadius: 8, padding: '4px 8px', fontSize: 11.5,
  }

  return (
    <div style={{ border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: '12px 14px', background: 'rgba(255,255,255,.02)', opacity: muted ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#0a0e17', background: color, borderRadius: 999, padding: '2px 9px' }}>
          {t(`audit.severity.${finding.severity}`, finding.severity)}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{text.title}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>· {finding.provider}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{text.detail}</div>
      <div style={{ fontSize: 12, color: CYAN, marginTop: 6 }}>
        <strong>{t('audit.common.recommendation', 'Recommendation')}:</strong> <span style={{ color: 'rgba(255,255,255,.78)' }}>{text.recommendation}</span>
      </div>
      {text.impact && !evidence && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>
          <strong style={{ color: 'rgba(255,255,255,.7)' }}>{t('audit.common.impact', 'Impact')}:</strong> {text.impact}
        </div>
      )}

      {/* Triage controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10 }}>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{t('audit.remediation.state.status', 'Status')}</label>
        <select
          value={status}
          onChange={e => onChange && onChange(finding.id, { status: e.target.value })}
          style={selectStyle}
          disabled={!onChange}
        >
          {FINDING_STATUSES.map(st => (
            <option key={st} value={st} style={{ color: '#000' }}>{t(`audit.remediation.state.${st}`, st)}</option>
          ))}
        </select>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginLeft: 4 }}>{t('audit.remediation.state.owner', 'Owner')}</label>
        <input
          value={ownerDraft}
          placeholder={t('audit.remediation.state.ownerPlaceholder', 'Assign…')}
          onChange={e => setOwnerDraft(e.target.value)}
          onBlur={() => { if (onChange && ownerDraft !== owner) onChange(finding.id, { owner: ownerDraft }) }}
          style={{ ...selectStyle, width: 150 }}
          disabled={!onChange}
        />
      </div>
    </div>
  )
}
