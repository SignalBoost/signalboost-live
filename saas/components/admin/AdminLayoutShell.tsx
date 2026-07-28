'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { ADMIN_SIDEBAR } from '@/lib/platform/unifiedPlatform'
import { useI18n } from '@/components/i18n/I18nProvider'
import CosaNotificationCenter from '@/components/admin/CosaNotificationCenter'
import { uiText } from '@/lib/i18n/uiText'

const nav = ADMIN_SIDEBAR

// Inline translations for the admin console chrome + sidebar labels, co-located
// across all 5 languages. nav labels are keyed by their English label so the
// shared ADMIN_SIDEBAR data structure doesn't need to change.
const COPY: Record<string, Record<string, any>> = {
  en: {
    checkingAccess: uiText('generatedUi.u_c6f0feac2ececca3'),
    ownerConsole: uiText('generatedUi.u_f7d0be450adb7b21'), controlRoom: uiText('generatedUi.u_8ec96b16bae350b8'),
    controlRoomDesc: uiText('generatedUi.u_22751c061570d2b5'),
    adminFlow: uiText('generatedUi.u_db93cd9512403072'), execPreview: uiText('generatedUi.u_80ad3c268ddeb079'), ownerRestricted: uiText('generatedUi.u_3a4becb6a0f683e3'),
    ownerRestrictedDesc: uiText('generatedUi.u_83984a699379c549'),
    nav: { 'Overview': uiText('generatedUi.u_d4b1ea5708dd5329'), 'Logs': uiText('generatedUi.u_ea2100dc89ae9fe2'), 'Outreach': uiText('generatedUi.u_a5803fdf10e57e66'), 'Marketing + Sales': uiText('generatedUi.u_dcba31525bd63b56'), 'Insights': uiText('generatedUi.u_2a932f90172e99ea'), 'Role Management': uiText('generatedUi.u_a5b449f8e7b1f4be'), 'Marketplace Monitor': uiText('generatedUi.u_025e59e79d169987'), 'SaaS Monitor': uiText('generatedUi.u_45c0d5e16acb8738'), 'Concierge Monitor': uiText('generatedUi.u_a1f160e587a8808c') },
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
