'use client'

// saas/components/hub/console/ProviderConsoleCard.tsx
// Hub Command Console — Child layout representations.
// High-density, compact grid layout tracking to prevent vertical clipping.

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
    <div style={{ background: 'rgba(13, 18, 32, 0.45)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Card Header Band */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: provider.accent, boxShadow: `0 0 8px ${provider.accent}` }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>{provider.name}</div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>{provider.subtitle}</div>
          </div>
        </div>
        <button onClick={onExpand} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: 6, color: '#1af0ff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
          Workspace →
        </button>
      </div>

      {/* Render Actions Layout */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {provider.sections.map((section, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {section.title}
            </div>
            
            {/* Highly dense two-column grid pack */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}>
              {section.templateIds.map(id => {
                const template = getTemplate(id)
                if (!template) return null
                const isDestructive = isDestructiveTemplate(id)
                const isArchive = id.includes('archive')

                return (
                  <button 
                    key={id} 
                    onClick={() => onRun(id)} 
                    style={{ 
                      padding: '5px 8px', 
                      borderRadius: 6, 
                      textAlign: 'left', 
                      fontSize: 11, 
                      fontWeight: 600, 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      border: isDestructive ? '1px solid rgba(239, 68, 68, 0.2)' : isArchive ? '1px solid rgba(255, 195, 0, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)', 
                      background: isDestructive ? 'rgba(239, 68, 68, 0.05)' : isArchive ? 'rgba(255, 195, 0, 0.05)' : 'rgba(255, 255, 255, 0.02)', 
                      color: isDestructive ? '#ef4444' : isArchive ? '#ffc300' : 'rgba(255, 255, 255, 0.8)' 
                    }}
                  >
                    <span style={{ fontSize: 11 }}>{template.icon}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Workspace Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>← {tierLabel}</button>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: 0 }}>{provider.name} Workspace</h2>
      </div>

      {/* Dense split dashboard view matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {provider.sections.map((section, idx) => (
          <div key={idx} style={{ background: 'rgba(13, 18, 32, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 10, padding: 12 }}>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: '#1af0ff', textTransform: 'uppercase', margin: '0 0 10px 0', letterSpacing: '0.04em' }}>{section.title}</h3>
            
            {/* Split layout inside sections to halve vertical storage footprint */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {section.templateIds.map(id => {
                const template = getTemplate(id)
                if (!template) return null
                const isDestructive = isDestructiveTemplate(id)
                const isArchive = id.includes('archive')

                return (
                  <div 
                    key={id} 
                    onClick={() => onRun(id)} 
                    style={{ 
                      padding: '8px 10px', 
                      borderRadius: 8, 
                      background: 'rgba(255,255,255,0.01)', 
                      border: isDestructive ? '1px solid rgba(239, 68, 68, 0.2)' : isArchive ? '1px solid rgba(255, 195, 0, 0.2)' : '1px solid rgba(255,255,255,0.05)', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      minHeight: '44px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{template.icon}</span>
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: isDestructive ? '#ef4444' : isArchive ? '#ffc300' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.label}</div>
                        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.description}</div>
                      </div>
                    </div>
                    <span style={{ color: isDestructive ? '#ef4444' : isArchive ? '#ffc300' : 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: 800, paddingLeft: 4, flexShrink: 0 }}>→</span>
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
