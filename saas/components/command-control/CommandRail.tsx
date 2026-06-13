'use client'

import type { CSSProperties } from 'react'
import type { CommandPageKey, CommandRailSection } from './types'

type CommandRailProps = {
  sections: CommandRailSection[]
  activePage: CommandPageKey
  onNavigate: (pageKey: CommandPageKey) => void
}

const railStyle: CSSProperties = {
  width: 272,
  flex: '0 0 272px',
  minHeight: 0,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.88), rgba(3,7,18,.86))',
  boxShadow: '0 24px 80px rgba(0,0,0,.32)',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  overflowY: 'auto',
}

const sectionTitleStyle: CSSProperties = {
  margin: '10px 8px 8px',
  color: 'rgba(255,255,255,.38)',
  fontSize: 10.5,
  fontWeight: 950,
  textTransform: 'uppercase',
  letterSpacing: '.16em',
}

function itemStyle(active: boolean, disabled?: boolean): CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 11px',
    borderRadius: 14,
    border: active ? '1px solid rgba(26,240,255,.46)' : '1px solid rgba(255,255,255,.08)',
    background: active ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.035)',
    color: disabled ? 'rgba(255,255,255,.28)' : active ? '#1af0ff' : 'rgba(255,255,255,.68)',
    fontSize: 13,
    fontWeight: 850,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? .65 : 1,
    textAlign: 'left',
  }
}

function isPrimaryActive(itemKey: string, itemPageKey: CommandPageKey | undefined, activePage: CommandPageKey): boolean {
  if (!itemPageKey) return false
  if (itemKey === activePage) return true
  return itemKey === 'providers' && activePage === 'providers'
}

export default function CommandRail({ sections, activePage, onNavigate }: CommandRailProps) {
  return (
    <aside className="command-rail" style={railStyle}>
      <div style={{ padding: '5px 6px 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 14, border: '1px solid rgba(26,240,255,.45)', background: 'radial-gradient(circle at 50% 50%, rgba(26,240,255,.24), rgba(26,240,255,.04))', display: 'grid', placeItems: 'center', color: '#1af0ff', fontWeight: 950 }}>⌁</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: '-.01em' }}>SignalBoost</div>
            <div style={{ color: 'rgba(255,255,255,.46)', fontSize: 11.5, fontWeight: 750 }}>Command Control</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 14, border: '1px solid rgba(255,195,0,.22)', background: 'rgba(255,195,0,.07)', color: '#ffc300', fontSize: 11.5, fontWeight: 850 }}>Know what is broken. Know what to fix next.</div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map(section => (
          <div key={section.title}>
            <div style={sectionTitleStyle}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {section.items.map(item => {
                const active = isPrimaryActive(item.key, item.pageKey, activePage)
                const disabled = item.disabled || !item.pageKey
                return (
                  <button
                    key={item.key}
                    className="hub-chip"
                    disabled={disabled}
                    onClick={() => item.pageKey && onNavigate(item.pageKey)}
                    style={itemStyle(active, disabled)}
                    title={disabled ? 'Planned workspace' : item.label}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}><span>{item.icon}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span></span>
                    {item.badge && <span style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', padding: '2px 6px', color: 'rgba(255,255,255,.5)', fontSize: 10.5 }}>{item.badge}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
