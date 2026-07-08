import Link from 'next/link'
import type { ReactNode } from 'react'

type Tone = 'danger' | 'warning' | 'healthy' | 'neutral'

type AdminMetricCardProps = {
  title: string
  value: ReactNode
  subtitle?: ReactNode
  href: string
  external?: boolean
  actionLabel?: string
  status?: string
  tone?: Tone
}

export default function AdminMetricCard({
  title,
  value,
  subtitle,
  href,
  external = false,
  actionLabel = 'View details →',
  status,
  tone = 'neutral',
}: AdminMetricCardProps) {
  const className = `sb-neon-panel sb-admin-action-card sb-admin-action-card--${tone}`
  const ariaLabel = `${actionLabel.replace(/\s*→$/, '')}: ${title}${status ? `, status ${status}` : ''}`
  const content = (
    <>
      <span className="sb-admin-action-card__status-row">
        <p>{title}</p>
        {status ? <em>{status}</em> : null}
      </span>
      <strong>{value}</strong>
      {subtitle ? <span>{subtitle}</span> : null}
      <span className="sb-admin-action-card__cue" aria-hidden="true">{actionLabel}</span>
    </>
  )

  if (external) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel}>
        {content}
      </a>
    )
  }

  return (
    <Link className={className} href={href} aria-label={ariaLabel}>
      {content}
    </Link>
  )
}
