'use client'

// saas/app/admin/page.tsx
// SignalBoost Admin — Executive Dashboard (Owner/Admin only)
// i18n: en, es, pt, pl, ru

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { ADMIN_SIDEBAR, COCKPIT_PANELS, CRM_STAGES, EXECUTIVE_RECOMMENDATIONS, FINANCIAL_LEDGER, FORECASTS, KPI_DASHBOARD } from '@/lib/platform/unifiedPlatform'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  body: string
  role: string
  openPanel: string
  panelNote: string
  desktop: string
  mobile: string
  aria: string
  financial: string
  kpi: string
  forecasting: string
  crm: string
  concierge: string
  marketplace: string
  saas: string
  unified: string
  horizon: string
  revenue: string
  campaign: string
  churn: string
}> = {
  en: {
    eyebrow: 'Executive Dashboard',
    title: 'Unified SignalBoost mission control',
    body: 'Financial, KPI, CRM, Outreach, Forecasting, Marketplace, SaaS, and Concierge telemetry consolidated into one owner/admin cockpit.',
    role: 'Restricted: Owner/Admin',
    openPanel: 'Open panel',
    panelNote: 'Keyboard-focusable NASA glass navigation with hover glow.',
    desktop: '▣ Desktop: sidebar + master cockpit',
    mobile: '▤ Mobile: stacked neon cards',
    aria: '⌨ ARIA regions + keyboard focus',
    financial: 'Financial dashboard',
    kpi: 'KPI dashboard',
    forecasting: 'Forecasting',
    crm: 'CRM + Outreach',
    concierge: 'Concierge executive insights',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unified: 'Unified engagement index',
    horizon: 'Horizon',
    revenue: 'Revenue',
    campaign: 'Campaign',
    churn: 'Churn',
  },
  es: {
    eyebrow: 'Panel Ejecutivo',
    title: 'Centro de control unificado de SignalBoost',
    body: 'Telemetría financiera, KPI, CRM, Difusión, Pronósticos, Marketplace, SaaS y Concierge consolidada en un solo panel de propietario/administrador.',
    role: 'Restringido: Propietario/Admin',
    openPanel: 'Abrir panel',
    panelNote: 'Navegación de vidrio NASA con foco de teclado y brillo al pasar.',
    desktop: '▣ Escritorio: barra lateral + cabina principal',
    mobile: '▤ Móvil: tarjetas neón apiladas',
    aria: '⌨ Regiones ARIA + foco de teclado',
    financial: 'Panel financiero',
    kpi: 'Panel de KPI',
    forecasting: 'Pronósticos',
    crm: 'CRM + Difusión',
    concierge: 'Perspectivas ejecutivas del Concierge',
    marketplace: 'Mercado',
    saas: 'SaaS',
    unified: 'Índice de participación unificado',
    horizon: 'Horizonte',
    revenue: 'Ingresos',
    campaign: 'Campaña',
    churn: 'Abandono',
  },
  pt: {
    eyebrow: 'Painel Executivo',
    title: 'Controle de missão unificado do SignalBoost',
    body: 'Telemetria financeira, KPI, CRM, Divulgação, Previsões, Marketplace, SaaS e Concierge consolidada em um único painel de proprietário/administrador.',
    role: 'Restrito: Proprietário/Admin',
    openPanel: 'Abrir painel',
    panelNote: 'Navegação em vidro NASA com foco de teclado e brilho ao passar.',
    desktop: '▣ Desktop: barra lateral + cabine principal',
    mobile: '▤ Mobile: cartões neon empilhados',
    aria: '⌨ Regiões ARIA + foco de teclado',
    financial: 'Painel financeiro',
    kpi: 'Painel de KPI',
    forecasting: 'Previsões',
    crm: 'CRM + Divulgação',
    concierge: 'Perspectivas executivas do Concierge',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unified: 'Índice de engajamento unificado',
    horizon: 'Horizonte',
    revenue: 'Receita',
    campaign: 'Campanha',
    churn: 'Cancelamento',
  },
  pl: {
    eyebrow: 'Panel Wykonawczy',
    title: 'Ujednolicone centrum kontroli SignalBoost',
    body: 'Telemetria finansowa, KPI, CRM, Outreach, Prognozy, Marketplace, SaaS i Concierge skonsolidowane w jednym panelu właściciela/administratora.',
    role: 'Dostęp ograniczony: Właściciel/Admin',
    openPanel: 'Otwórz panel',
    panelNote: 'Nawigacja szklana NASA z fokusem klawiatury i poświatą po najechaniu.',
    desktop: '▣ Desktop: pasek boczny + główna kabina',
    mobile: '▤ Mobile: ułożone karty neonowe',
    aria: '⌨ Regiony ARIA + fokus klawiatury',
    financial: 'Panel finansowy',
    kpi: 'Panel KPI',
    forecasting: 'Prognozy',
    crm: 'CRM + Outreach',
    concierge: 'Spostrzeżenia wykonawcze Concierge',
    marketplace: 'Marketplace',
    saas: 'SaaS',
    unified: 'Ujednolicony wskaźnik zaangażowania',
    horizon: 'Horyzont',
    revenue: 'Przychód',
    campaign: 'Kampania',
    churn: 'Rezygnacje',
  },
  ru: {
    eyebrow: 'Исполнительная панель',
    title: 'Единый центр управления SignalBoost',
    body: 'Финансовая телеметрия, KPI, CRM, Охват, Прогнозы, Маркетплейс, SaaS и Консьерж — всё в одной панели владельца/администратора.',
    role: 'Доступ ограничен: Владелец/Администратор',
    openPanel: 'Открыть панель',
    panelNote: 'Стеклянная навигация NASA с фокусом клавиатуры и свечением при наведении.',
    desktop: '▣ Рабочий стол: боковая панель + главная кабина',
    mobile: '▤ Мобильный: стопка неоновых карточек',
    aria: '⌨ Регионы ARIA + фокус клавиатуры',
    financial: 'Финансовая панель',
    kpi: 'Панель KPI',
    forecasting: 'Прогнозы',
    crm: 'CRM + Охват',
    concierge: 'Исполнительные инсайты Консьержа',
    marketplace: 'Маркетплейс',
    saas: 'SaaS',
    unified: 'Единый индекс вовлечённости',
    horizon: 'Горизонт',
    revenue: 'Выручка',
    campaign: 'Кампания',
    churn: 'Отток',
  },
}

const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']

function getLang(): Lang {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as Lang }
  if (typeof navigator === 'undefined') return 'en'
  const code = (navigator.language || '').slice(0, 2).toLowerCase()
  const map: Record<string, Lang> = { en: 'en', es: 'es', pt: 'pt', pl: 'pl', ru: 'ru' }
  return map[code] || 'en'
}

export default function AdminOverviewPage() {
  const { lang: activeLang } = useI18n()
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => { setLang(getLang()) }, [])
  const t = COPY[(activeLang in COPY ? activeLang : 'en') as Lang]

  return (
    <div className="sb-cockpit-stack">
      {/* lang switcher */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 8 }}>
        {LANGS.map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              padding: '4px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer',
              border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)',
              background: lang === l ? 'rgba(26,240,255,.14)' : 'rgba(255,255,255,.04)',
              color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.55)',
            }}
          >{l}</button>
        ))}
      </div>

      <section className="sb-admin-topbar" role="banner" aria-label={t.eyebrow}>
        <div>
          <p className="sb-eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="sb-body">{t.body}</p>
        </div>
        <span className="sb-role-pill">{t.role}</span>
      </section>

      <section className="sb-cockpit-grid" aria-label="Admin Console sidebar sections">
        {ADMIN_SIDEBAR.map(item => (
          <a key={item.href} className="sb-neon-panel" href={item.href} aria-label={`${t.openPanel} ${item.label}`}>
            <p><span aria-hidden="true">{item.icon}</span> {item.label}</p>
            <strong>{t.openPanel}</strong>
            <span>{t.panelNote}</span>
          </a>
        ))}
      </section>

      <section className="sb-mission-grid" aria-label="Cockpit panels">
        {COCKPIT_PANELS.map(panel => (
          <article key={panel.title} className="sb-glass-panel" tabIndex={0}>
            <h3>{panel.title}</h3>
            <p><strong>{panel.value}</strong></p>
            <p>{panel.status}</p>
          </article>
        ))}
      </section>

      <section className="sb-wireframe" aria-label="Wireframe preview for pull request">
        <div className="sb-wireframe__markers">
          <span>{t.desktop}</span>
          <span>{t.mobile}</span>
          <span>{t.aria}</span>
        </div>
        <div className="sb-wireframe__canvas">
          <aside className="sb-wireframe__sidebar">
            <span className="sb-wireframe__label">Sidebar</span>
            {ADMIN_SIDEBAR.slice(0, 5).map(item => <div key={item.label} className="sb-wireframe__box">{item.icon} {item.label}</div>)}
          </aside>
          <div className="sb-wireframe__flow" aria-hidden="true"><span>→</span><span>→</span><span>→</span></div>
          <main className="sb-wireframe__main">
            <div className="sb-wireframe__topbar">{t.eyebrow} <span>{t.role}</span></div>
            <div className="sb-wireframe__grid">
              {[t.financial, t.kpi, t.crm, 'Outreach', t.forecasting, t.concierge].map(card => <div key={card} className="sb-wireframe__box sb-wireframe__box--main">{card}</div>)}
            </div>
          </main>
        </div>
      </section>

      <section className="sb-mission-grid" aria-label="Executive intelligence">
        <article className="sb-glass-panel">
          <h3>{t.financial}</h3>
          {Object.entries(FINANCIAL_LEDGER).map(([key, value]) => (
            <p key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong> · {value}</p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t.kpi}</h3>
          <p><strong>{t.marketplace}</strong> · {KPI_DASHBOARD.marketplace.join(' · ')}</p>
          <p><strong>{t.saas}</strong> · {KPI_DASHBOARD.saas.join(' · ')}</p>
          <p><strong>{t.unified}</strong> · {KPI_DASHBOARD.unifiedEngagementIndex}</p>
        </article>
        <article className="sb-glass-panel">
          <h3>{t.forecasting}</h3>
          {FORECASTS.map(item => (
            <p key={item.horizon}>
              <strong>{item.horizon}</strong> · {item.revenue} · {t.campaign.toLowerCase()} {item.campaignSuccess} · {t.churn.toLowerCase()} {item.churnRisk}
            </p>
          ))}
        </article>
        <article className="sb-glass-panel">
          <h3>{t.crm}</h3>
          {CRM_STAGES.map(stage => (
            <p key={stage.stage}><strong>{stage.stage}</strong> · {stage.automation}</p>
          ))}
        </article>
        <article className="sb-glass-panel sb-glass-panel--wide">
          <h3>{t.concierge}</h3>
          {EXECUTIVE_RECOMMENDATIONS.map(item => <p key={item}>• {item}</p>)}
        </article>
      </section>
    </div>
  )
}
