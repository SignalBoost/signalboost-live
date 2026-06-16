'use client'

// Hub Command Console — Child layout representations.
// High-density compact grid layouts with explicit edge width safety.

import { type ConsoleProvider, isDestructiveTemplate, isProviderLive } from '@/lib/hub/console-catalog'
import { getTemplate } from '@/lib/hub/provider-templates'
import { useTranslation } from '@/components/i18n/useTranslation'
import { type Lang } from '../shared'

type CardProps = {
  provider: ConsoleProvider
  lang: Lang
  onExpand: () => void
  onRun: (templateId: string) => void
}

export function ProviderConsoleCard({ provider, lang, onExpand, onRun }: CardProps) {
  const { dict } = useTranslation()
  const live = isProviderLive(provider.id)
  return (
    <div style={{ background: 'rgba(13, 18, 32, 0.45)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, overflow: 'hidden', boxSizing: 'border-box' }}>
      {/* Card Header Band */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: provider.accent, boxShadow: `0 0 8px ${provider.accent}` }} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>{provider.name}</div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>{provider.subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!live && <span style={{ fontSize: 8.5, fontWeight: 800, color: '#ffc300', background: 'rgba(255,195,0,0.12)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 4, padding: '2px 5px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Soon</span>}
          <button onClick={onExpand} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: 6, color: '#1af0ff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
            Workspace →
          </button>
        </div>
      </div>

      {/* Render Actions Layout */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box' }}>
        {provider.sections.map((section, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {section.title}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
              {section.templateIds.map(id => {
                const template = getTemplate(id, dict)
                if (!template) return null
                const isDestructive = isDestructiveTemplate(id)
                const isArchive = id.includes('archive')

                return (
                  <button 
                    key={id} 
                    onClick={live ? () => onRun(id) : undefined}
                    disabled={!live}
                    title={live ? template.label : 'Coming soon'}
                    style={{ 
                      padding: '5px 8px', 
                      borderRadius: 6, 
                      textAlign: 'left', 
                      fontSize: 11, 
                      fontWeight: 600, 
                      cursor: live ? 'pointer' : 'not-allowed', 
                      opacity: live ? 1 : 0.4, 
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
  onHome: () => void // Explicitly registers type parameter safety bounds
  onRun: (templateId: string) => void
}

export function ProviderWorkspace({ provider, tierLabel, lang, onBack, onHome, onRun }: WorkspaceProps) {
  const { dict } = useTranslation()
  const live = isProviderLive(provider.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: '100%', boxSizing: 'border-box', paddingRight: '4px' }}>
      {/* Dynamic Breadcrumb Track Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
        <button onClick={onHome} style={{ background: 'none', border: 'none', color: '#1af0ff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>🎛️ Hub Home</button>
        <span>/</span>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{tierLabel}</button>
        <span>/</span>
        <span style={{ color: '#fff', fontWeight: 800 }}>{provider.name} Workspace</span>
      </div>

      {!live && (
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#ffc300', background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 8, padding: '8px 12px' }}>
          ⏳ {provider.name} actions are coming soon — this is a preview of what will be available.
        </div>
      )}

      {/* Grid layout with strict multi-column spacing rules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        {provider.sections.map((section, idx) => (
          <div key={idx} style={{ background: 'rgba(13, 18, 32, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 10, padding: 12, boxSizing: 'border-box', overflow: 'hidden' }}>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: '#1af0ff', textTransform: 'uppercase', margin: '0 0 10px 0', letterSpacing: '0.04em' }}>{section.title}</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
              {section.templateIds.map(id => {
                const template = getTemplate(id, dict)
                if (!template) return null
                const isDestructive = isDestructiveTemplate(id)
                const isArchive = id.includes('archive')

                return (
                  <div 
                    key={id} 
                    onClick={live ? () => onRun(id) : undefined}
                    title={live ? template.label : 'Coming soon'}
                    style={{ 
                      padding: '8px 10px', 
                      borderRadius: 8, 
                      opacity: live ? 1 : 0.4, 
                      background: 'rgba(255,255,255,0.01)', 
                      border: isDestructive ? '1px solid rgba(239, 68, 68, 0.2)' : isArchive ? '1px solid rgba(255, 195, 0, 0.2)' : '1px solid rgba(255,255,255,0.05)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      minHeight: '44px',
                      boxSizing: 'border-box',
                      minWidth: 0,
                      cursor: live ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{template.icon}</span>
                      <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
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
