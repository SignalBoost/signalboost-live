'use client'

// saas/components/hub/console/ProviderConsoleCard.tsx
// Hub Command Console — Provider card + dedicated workspace.
//
// A provider card shows its sectioned template grid (max two providers render
// per page, set by CommandConsole). Each card expands into a full-width
// workspace with more room. Template buttons call onRun(templateId); the
// CommandConsole owns the single action-form overlay so auth + policy + audit
// (enforced server-side in /api/hub/action) run through one path.

import { useState } from 'react'
import { getTemplate } from '@/lib/hub/provider-templates'
import {
  ConsoleProvider,
  isDestructiveTemplate,
  providerActionCount,
  STATUS_COLOR,
  STATUS_LABEL,
} from '@/lib/hub/console-catalog'
import { Lang } from '../shared'

type RunFn = (templateId: string) => void

// ---------------------------------------------------------------------------
// Brand token — accent-tinted square with provider mark (no external assets).
// ---------------------------------------------------------------------------

function BrandMark({ accent, mark, size = 36 }: { accent: string; mark: string; size?: number }) {
  const fontSize = mark.length >= 3 ? size * 0.3 : mark.length === 2 ? size * 0.4 : size * 0.5
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hexToRgba(accent, 0.16),
        border: `1px solid ${hexToRgba(accent, 0.5)}`,
        color: accent,
        fontWeight: 900,
        fontSize,
        letterSpacing: mark.length >= 3 ? '-0.02em' : 0,
        boxShadow: `0 0 18px ${hexToRgba(accent, 0.18)}`,
      }}
    >
      {mark}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status pill — "Live ▾" with a small meta popover.
// ---------------------------------------------------------------------------

function StatusPill({ provider }: { provider: ConsoleProvider }) {
  const [open, setOpen] = useState(false)
  const color = STATUS_COLOR[provider.status]
  const label = STATUS_LABEL[provider.status]
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 11px',
          borderRadius: 9,
          border: `1px solid ${hexToRgba(color, 0.45)}`,
          background: hexToRgba(color, 0.12),
          color,
          fontSize: 12,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        {label}
        <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            minWidth: 200,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,.12)',
            background: 'rgba(8,12,22,.98)',
            boxShadow: '0 18px 50px rgba(0,0,0,.6)',
          }}
        >
          <Meta k="Status" v={label} accent={color} />
          <Meta k="Category" v={provider.subtitle} />
          <Meta k="Actions" v={`${providerActionCount(provider.id)} templates`} />
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 10.5, color: 'rgba(255,255,255,.5)', lineHeight: 1.5 }}>
            {provider.status === 'live'
              ? 'Credentials detected. Live actions execute against this provider.'
              : 'Wired and gated. Connect credentials to enable live execution.'}
          </div>
        </div>
      )}
    </div>
  )
}

function Meta({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontSize: 11.5 }}>
      <span style={{ color: 'rgba(255,255,255,.5)' }}>{k}</span>
      <span style={{ color: accent || 'rgba(255,255,255,.85)', fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template button — read / write / destructive styling from policy intent.
// ---------------------------------------------------------------------------

function TemplateButton({ templateId, accent, onRun, span }: { templateId: string; accent: string; onRun: RunFn; span?: boolean }) {
  const template = getTemplate(templateId)
  if (!template) return null

  const destructive = isDestructiveTemplate(templateId)
  const readOnly = template.api.method === 'GET'

  const border = destructive ? 'rgba(239,68,68,.42)' : readOnly ? 'rgba(255,255,255,.12)' : hexToRgba(accent, 0.34)
  const bg = destructive ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.035)'
  const text = destructive ? '#fca5a5' : 'rgba(255,255,255,.9)'
  const hoverBg = destructive ? 'rgba(239,68,68,.14)' : hexToRgba(accent, 0.12)
  const hoverBorder = destructive ? 'rgba(239,68,68,.6)' : hexToRgba(accent, 0.55)

  return (
    <button
      onClick={() => onRun(templateId)}
      title={template.description}
      style={{
        gridColumn: span ? '1 / -1' : 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 13px',
        borderRadius: 11,
        border: `1px solid ${border}`,
        background: bg,
        color: text,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all .14s ease',
        minWidth: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.borderColor = hoverBorder
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = bg
        e.currentTarget.style.borderColor = border
      }}
    >
      <span style={{ fontSize: 16, flex: '0 0 auto' }}>{template.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.label}</span>
      {template.requiresConfirm && !destructive && (
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,195,0,.8)', flex: '0 0 auto' }}>●</span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sections — shared between card and workspace; columns differ.
// ---------------------------------------------------------------------------

function ProviderSections({ provider, columns, onRun }: { provider: ConsoleProvider; columns: number; onRun: RunFn }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {provider.sections.map(section => {
        const odd = section.templateIds.length % 2 === 1
        return (
          <div key={section.title}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.55)',
                marginBottom: 9,
              }}
            >
              {section.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 10 }}>
              {section.templateIds.map((tid, i) => (
                <TemplateButton
                  key={tid}
                  templateId={tid}
                  accent={provider.accent}
                  onRun={onRun}
                  span={columns === 2 && odd && i === section.templateIds.length - 1}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card (two per page)
// ---------------------------------------------------------------------------

export function ProviderConsoleCard({
  provider,
  lang,
  onExpand,
  onRun,
}: {
  provider: ConsoleProvider
  lang: Lang
  onExpand: () => void
  onRun: RunFn
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 440,
        padding: 22,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,.08)',
        background: 'linear-gradient(160deg, rgba(20,28,46,.55), rgba(8,11,20,.35))',
        boxShadow: '0 12px 40px rgba(0,0,0,.28)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <BrandMark accent={provider.accent} mark={provider.mark} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{provider.name}</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(255,255,255,.45)', marginTop: 4 }}>
            {provider.subtitle}
          </div>
        </div>
        <button
          onClick={onExpand}
          title="Open dedicated workspace"
          style={{
            flex: '0 0 auto',
            padding: '6px 10px',
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,.14)',
            background: 'rgba(255,255,255,.04)',
            color: 'rgba(255,255,255,.7)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#1af0ff'
            e.currentTarget.style.borderColor = 'rgba(26,240,255,.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,.7)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,.14)'
          }}
        >
          ⤢ Expand
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatusPill provider={provider} />
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,.07)', marginBottom: 16 }} />

      <ProviderSections provider={provider} columns={2} onRun={onRun} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Workspace (full-width, single provider)
// ---------------------------------------------------------------------------

export function ProviderWorkspace({
  provider,
  tierLabel,
  lang,
  onBack,
  onRun,
}: {
  provider: ConsoleProvider
  tierLabel: string
  lang: Lang
  onBack: () => void
  onRun: RunFn
}) {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{
          marginBottom: 16,
          padding: '7px 12px',
          borderRadius: 9,
          border: '1px solid rgba(255,255,255,.14)',
          background: 'rgba(255,255,255,.04)',
          color: 'rgba(255,255,255,.75)',
          fontSize: 12.5,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        ← {tierLabel} overview
      </button>

      <div
        style={{
          padding: 26,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,.09)',
          background: 'linear-gradient(160deg, rgba(20,28,46,.6), rgba(8,11,20,.4))',
          boxShadow: '0 16px 50px rgba(0,0,0,.32)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
          <BrandMark accent={provider.accent} mark={provider.mark} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.05 }}>{provider.name}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(255,255,255,.45)', marginTop: 5 }}>
              {provider.subtitle}
            </div>
          </div>
          <StatusPill provider={provider} />
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,.07)', marginBottom: 20 }} />

        <ProviderSections provider={provider} columns={3} onRun={onRun} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// util
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  if ([r, g, b].some(n => Number.isNaN(n))) return `rgba(148,163,184,${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
