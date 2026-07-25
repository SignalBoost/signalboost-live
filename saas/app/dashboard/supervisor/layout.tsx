import Link from 'next/link'
import type { ReactNode } from 'react'
import ProtocolCapabilitySummary from '@/components/supervisor/ProtocolCapabilitySummary'

const links = [
  { href: '/dashboard/supervisor', label: 'Operations Center' },
  { href: '/dashboard/supervisor/protocol-capabilities', label: 'Protocol Capabilities' },
  { href: '/dashboard/supervisor/missions/reviews', label: 'Mission Reviews' },
] as const

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav aria-label="Supervisor navigation" style={nav}>
        <strong style={brand}>Supervisor</strong>
        <div style={linksStyle}>
          {links.map(link => (
            <Link key={link.href} href={link.href} style={item}>
              {link.label}
            </Link>
          ))}
        </div>
        <span style={boundary}>Read-only diagnostics</span>
      </nav>
      <ProtocolCapabilitySummary />
      {children}
    </div>
  )
}

const nav = {
  position: 'sticky',
  top: 0,
  zIndex: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  padding: '10px 24px',
  borderBottom: '1px solid rgba(255,255,255,.1)',
  background: 'rgba(5,10,18,.94)',
  backdropFilter: 'blur(16px)',
} as const

const brand = { color: '#fff', fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' } as const
const linksStyle = { display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' } as const
const item = {
  color: 'rgba(255,255,255,.8)',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 700,
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.1)',
} as const
const boundary = { color: '#38f2a4', fontSize: 11, fontWeight: 800 } as const
