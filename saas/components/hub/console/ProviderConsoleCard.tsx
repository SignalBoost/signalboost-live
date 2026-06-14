'use client'

// saas/components/hub/console/ProviderConsoleCard.tsx
// Hub Command Console — Child layout representations.

import { type ConsoleProvider, isDestructiveTemplate } from '@/lib/hub/console-catalog'
import { getTemplate } from '@/lib/hub/provider-templates'
import { type Lang } from '../shared'

type CardProps = {
  provider: ConsoleProvider
  lang: Lang
  onExpand: () => void
  onRun: (templateId: string) => void
}

export function ProviderConsoleCard({ provider, lang, onExpand, onRun }: CardProps) {
  return (
    <div style={{ background: 'rgba(13, 18, 32, 0.45)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: provider.accent, boxShadow: `0 0 10px ${provider.accent}` }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.03em' }}>{provider.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>{provider.subtitle}</div>
          </div>
        </div>
        <button onClick={onExpand} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 10px', borderRadius: 8, color: '#1af0ff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          Workspace →
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {provider.sections.map((section, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{section.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {section.templateIds.map(id => {
                const template = getTemplate(id)
                if (!template) return null
                const isDestructive = isDestructiveTemplate(id)
                const isArchive = id.includes('archive')

                return (
                  <button key={id} onClick={() => onRun(id)} style={{ padding: '8px 10px', borderRadius: 8, textAlign: 'left', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: isDestructive ? '1px solid rgba(239, 68, 68, 0.25)' : isArchive ? '1px solid rgba(255, 195, 0, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)', background: isDestructive ? 'rgba(239, 68, 68, 0.06)' : isArchive ? 'rgba(255, 195, 0, 0.06)' : 'rgba(255, 255, 255, 0.03)', color: isDestructive ? '#ef4444' : isArchive ? '#ffc300' : 'rgba(255, 255, 255, 0.85)' }}>
                    <span>{template.icon}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type WorkspaceProps = {
  provider: ConsoleProvider
  tierLabel: string
  lang: Lang
  onBack: () => void
  onRun: (templateId: string) => void
}

export function ProviderWorkspace({ provider, tierLabel, lang, onBack, onRun }: WorkspaceProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>← {tierLabel}</button>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0 }}>{provider.name} Workspace</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {provider.sections.map((section, idx) => (
          <div key={idx} style={{ background: 'rgba(13, 18, 32, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: 12, fontWeight: 800, color: '#1af0ff', textTransform: 'uppercase', margin: '0 0 14px 0', letterSpacing: '0.04em' }}>{section.title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.templateIds.map(id => {
                const template = getTemplate(id)
                if (!template) return null
                const isDestructive = isDestructiveTemplate(id)
                const isArchive = id.includes('archive')

                return (
                  <div key={id} onClick={() => onRun(id)} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 18 }}>{template.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isDestructive ? '#ef4444' : isArchive ? '#ffc300' : '#fff' }}>{template.label}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{template.description}</div>
                      </div>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>→</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
