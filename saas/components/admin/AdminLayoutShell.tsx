'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { ADMIN_SIDEBAR } from '@/lib/platform/unifiedPlatform'
import { useI18n } from '@/components/i18n/I18nProvider'
import CosaNotificationCenter from '@/components/admin/CosaNotificationCenter'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const nav = ADMIN_SIDEBAR

// Inline translations for the admin console chrome + sidebar labels, co-located
// across all 5 languages. nav labels are keyed by their English label so the
// shared ADMIN_SIDEBAR data structure doesn't need to change.
const COPY: Record<string, Record<string, any>> = {
  en: {
    checkingAccess: uiCopy('u_4439300654185c3e'),
    ownerConsole: uiCopy('u_56143cf756a05d03'), controlRoom: uiCopy('u_d8627db551325aa8'),
    controlRoomDesc: uiCopy('u_05c86d045aa6c92e'),
    adminFlow: uiCopy('u_0f8a897f669d2cde'), execPreview: uiCopy('u_2a1ea5433e8c3ca4'), ownerRestricted: uiCopy('u_e612b82a91b89ca2'),
    ownerRestrictedDesc: uiCopy('u_9d79f484e19783ef'),
    nav: { 'Overview': uiCopy('u_bc5aabb255341c4b'), 'Logs': uiCopy('u_1aef1f2932a8beb8'), 'Outreach': uiCopy('u_b5223f1e29eb5733'), 'Marketing + Sales': uiCopy('u_77ee1300bfd8e22c'), 'Insights': uiCopy('u_26bfdaa00fec57fd'), 'Role Management': uiCopy('u_bf3e021d9aec877b'), 'Marketplace Monitor': uiCopy('u_bd978aa1705b188d'), 'SaaS Monitor': uiCopy('u_0e4c940f0f9cd725'), 'Concierge Monitor': uiCopy('u_a1d5bebba906f90e') },
  },
  es: {
    checkingAccess: 'Comprobando acceso de propietario/administrador…',
    ownerConsole: 'Consola del propietario', controlRoom: 'Sala de control',
    controlRoomDesc: 'Resumen, Registros, Prospección, Análisis, Gestión de roles, Monitor del marketplace, Monitor SaaS y Monitor del Concierge en una sola ruta.',
    adminFlow: 'Flujo de administración', execPreview: 'Vista ejecutiva', ownerRestricted: 'Restringido a propietario/administrador',
    ownerRestrictedDesc: 'Las recomendaciones de finanzas, KPI, CRM, prospección, previsiones y Concierge están restringidas a roles de propietario/administrador.',
    nav: { 'Overview': 'Resumen', 'Logs': 'Registros', 'Outreach': 'Prospección', 'Marketing + Sales': 'Marketing + Ventas', 'Insights': 'Análisis', 'Role Management': 'Gestión de roles', 'Marketplace Monitor': 'Monitor del marketplace', 'SaaS Monitor': 'Monitor SaaS', 'Concierge Monitor': 'Monitor del Concierge' },
  },
  pt: {
    checkingAccess: 'Verificando acesso de proprietário/administrador…',
    ownerConsole: 'Console do proprietário', controlRoom: 'Sala de controle',
    controlRoomDesc: 'Visão geral, Registros, Prospecção, Insights, Gestão de funções, Monitor do marketplace, Monitor SaaS e Monitor do Concierge em um único caminho.',
    adminFlow: 'Fluxo de administração', execPreview: 'Visão executiva', ownerRestricted: 'Restrito a proprietário/administrador',
    ownerRestrictedDesc: 'As recomendações de finanças, KPI, CRM, prospecção, previsões e Concierge são restritas a funções de proprietário/administrador.',
    nav: { 'Overview': 'Visão geral', 'Logs': 'Registros', 'Outreach': 'Prospecção', 'Marketing + Sales': 'Marketing + Vendas', 'Insights': 'Insights', 'Role Management': 'Gestão de funções', 'Marketplace Monitor': 'Monitor do marketplace', 'SaaS Monitor': 'Monitor SaaS', 'Concierge Monitor': 'Monitor do Concierge' },
  },
  pl: {
    checkingAccess: 'Sprawdzanie dostępu właściciela/administratora…',
    ownerConsole: 'Konsola właściciela', controlRoom: 'Centrum sterowania',
    controlRoomDesc: 'Przegląd, Dzienniki, Pozyskiwanie, Statystyki, Zarządzanie rolami, Monitor marketplace, Monitor SaaS i Monitor Concierge w jednej ścieżce.',
    adminFlow: 'Przepływ administracyjny', execPreview: 'Podgląd zarządczy', ownerRestricted: 'Tylko właściciel/administrator',
    ownerRestrictedDesc: 'Rekomendacje finansowe, KPI, CRM, pozyskiwania, prognoz i Concierge są dostępne tylko dla ról właściciela/administratora.',
    nav: { 'Overview': 'Przegląd', 'Logs': 'Dzienniki', 'Outreach': 'Pozyskiwanie', 'Marketing + Sales': 'Marketing i Sprzedaż', 'Insights': 'Statystyki', 'Role Management': 'Zarządzanie rolami', 'Marketplace Monitor': 'Monitor marketplace', 'SaaS Monitor': 'Monitor SaaS', 'Concierge Monitor': 'Monitor Concierge' },
  },
  ru: {
    checkingAccess: 'Проверка доступа владельца/администратора…',
    ownerConsole: 'Консоль владельца', controlRoom: 'Центр управления',
    controlRoomDesc: 'Обзор, Журналы, Привлечение, Аналитика, Управление ролями, Монитор маркетплейса, Монитор SaaS и Монитор Concierge — в одном месте.',
    adminFlow: 'Поток администрирования', execPreview: 'Обзор для руководства', ownerRestricted: 'Только для владельца/администратора',
    ownerRestrictedDesc: 'Рекомендации по финансам, KPI, CRM, привлечению, прогнозам и Concierge доступны только владельцу/администратору.',
    nav: { 'Overview': 'Обзор', 'Logs': 'Журналы', 'Outreach': 'Привлечение', 'Marketing + Sales': 'Маркетинг + продажи', 'Insights': 'Аналитика', 'Role Management': 'Управление ролями', 'Marketplace Monitor': 'Монитор маркетплейса', 'SaaS Monitor': 'Монитор SaaS', 'Concierge Monitor': 'Монитор Concierge' },
  },
}

export default function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { lang } = useI18n()
  const c = COPY[lang] || COPY.en

  const adminEmails = useMemo(
    () => (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
    []
  )

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) {
        router.replace('/dashboard')
        return
      }

      const emailAllowed = !!user.email && adminEmails.includes(user.email.toLowerCase())
      let roleAllowed = false
      const { data: memberships } = await supabase
        .from('team_members')
        .select('role,status,owner_id,member_id')
        .or(`member_id.eq.${user.id},owner_id.eq.${user.id}`)

      if (memberships?.length) {
        roleAllowed = memberships.some(
          m => (m.status === 'active' || m.owner_id === user.id) && (m.role === 'owner' || m.role === 'admin' || m.owner_id === user.id)
        )
      }

      const ok = emailAllowed || roleAllowed
      setAuthorized(ok)
      setLoading(false)
      if (!ok) router.replace('/dashboard')
    }
    check()
  }, [adminEmails, router])

  if (loading) return <div className="min-h-screen bg-slate-950 p-10 text-slate-100">{c.checkingAccess}</div>
  if (!authorized) return null

  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-sidebar">
        <div className="sb-sidebar__header">
          <span className="sb-eyebrow">{c.ownerConsole}</span>
          <h2>{c.controlRoom}</h2>
          <p>{c.controlRoomDesc}</p>
        </div>
        <nav className="sb-sidebar__nav">
          <section className="sb-sidebar__group">
            <p>{c.adminFlow}</p>
            {nav.map(({ icon, label, href }) => (
              label === 'Marketing + Sales' ? (
                <CosaNotificationCenter
                  key={href}
                  icon={icon}
                  label={c.nav[label] || label}
                  href={href}
                  active={pathname === href || pathname === '/dashboard/cosa'}
                />
              ) : (
                <Link key={href} href={href} className="sb-sidebar__link" style={pathname === href ? { background: 'rgba(26,240,255,.14)', color: '#fff', borderColor: 'rgba(26,240,255,.42)', boxShadow: '0 0 24px rgba(26,240,255,.14)' } : undefined}>
                  <span aria-hidden="true">{icon}</span><span>{c.nav[label] || label}</span>
                </Link>
              )
            ))}
          </section>
        </nav>
      </aside>
      <main className="sb-dashboard-main">{children}</main>
      <aside className="sb-live-preview">
        <span className="sb-eyebrow">{c.execPreview}</span>
        <h3>{c.ownerRestricted}</h3>
        <p>{c.ownerRestrictedDesc}</p>
      </aside>
    </div>
  )
}
