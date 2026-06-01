'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  className?: string
  children?: React.ReactNode
}

export default function AdminNavLink({ className, children = 'Admin' }: Props) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let active = true

    async function loadAdminSession() {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store', credentials: 'same-origin' })
        if (!res.ok) return
        const data = await res.json()
        if (active) setIsAdmin(data?.role === 'admin')
      } catch {
        if (active) setIsAdmin(false)
      }
    }

    loadAdminSession()
    return () => { active = false }
  }, [])

  if (!isAdmin) return null

  return <Link href="/admin" className={className}>{children}</Link>
}
