'use client'

import Link from 'next/link'

type CosaNotificationCenterProps = {
  icon: string
  label: string
  href: string
  active?: boolean
}

export default function CosaNotificationCenter({ icon, label, href, active = false }: CosaNotificationCenterProps) {
  return (
    <Link
      href={href}
      className="sb-sidebar__link"
      style={active ? {
        background: 'rgba(26,240,255,.14)',
        color: '#fff',
        borderColor: 'rgba(26,240,255,.42)',
        boxShadow: '0 0 24px rgba(26,240,255,.14)',
      } : undefined}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span
        aria-label="COSA notifications"
        title="COSA notifications"
        style={{
          marginLeft: 'auto',
          minWidth: 18,
          height: 18,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,195,0,.16)',
          border: '1px solid rgba(255,195,0,.34)',
          color: '#ffc300',
          fontSize: 11,
          fontWeight: 900,
        }}
      >
        •
      </span>
    </Link>
  )
}
