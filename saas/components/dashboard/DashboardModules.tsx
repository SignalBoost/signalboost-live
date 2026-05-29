'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES, type ServiceKey } from '@/lib/services/catalog'

const GOLD = '#ffc300'
const BLUE = '#3b82f6'

type ModuleKey = ServiceKey

export default function DashboardModules() {
  const { dict } = useI18n()
  const [active, setActive] = useState<ModuleKey>('promote')

  const modules = useMemo(
    () => SERVICES.map((service) => ({
      ...service,
      title: t(dict, `services.${service.key}.title`, service.titleFallback),
      desc: t(dict, `services.${service.key}.desc`, service.descFallback),
      cta: t(dict, `services.${service.key}.cta`, service.ctaFallback),
      tasks: [1, 2, 3].map((task) => t(dict, `services.${service.key}.workflow.${task}`, [
        'Add source material or URL',
        'Review AI suggestions',
        'Approve launch-ready results',
      ][task - 1])),
      suggestions: [1, 2].map((item) => t(dict, `services.${service.key}.suggestions.${item}`, [
        'Set one goal and one audience before generating.',
        'Localize output for every supported language.',
      ][item - 1])),
      results: [1, 2].map((item) => t(dict, `services.${service.key}.results.${item}`, [
        'Action checklist',
        'Ready-to-use content blocks',
      ][item - 1])),
    })),
    [dict]
  )

  const selected = modules.find(module => module.key === active) || modules[0]

  return (
    <section className="fathom-glass" style={{ borderRadius: 18, padding: 18, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div className="terminal-text" style={{ color: GOLD, fontSize: 11, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>
            {t(dict, 'dashboard_modules.kicker', 'Workspace modules')}
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 24 }}>{t(dict, 'dashboard_modules.title', 'Choose what to build next')}</h2>
        </div>
        <Link href="/faq" className="terminal-text" style={{ color: '#fff', textDecoration: 'none', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '9px 13px', fontSize: 12, fontWeight: 800 }}>
          ❓ {t(dict, 'support.faq', 'FAQ')}
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, .8fr) minmax(260px, 1.2fr)', gap: 16 }} className="dashboard-module-grid">
        <div style={{ display: 'grid', gap: 8 }}>
          {modules.map(module => {
            const isActive = module.key === active
            return (
              <button
                key={module.key}
                type="button"
                onClick={() => setActive(module.key)}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${isActive ? 'rgba(255,195,0,.45)' : 'var(--border-soft)'}`,
                  background: isActive ? 'rgba(255,195,0,.12)' : 'rgba(255,255,255,.03)',
                  color: '#fff',
                  borderRadius: 14,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 20 }}>{module.icon}</span>
                <span style={{ fontWeight: 800 }}>{module.title}</span>
              </button>
            )
          })}
        </div>

        <article style={{ border: `1px solid rgba(59,130,246,.25)`, background: 'linear-gradient(135deg, rgba(59,130,246,.12), rgba(255,195,0,.06))', borderRadius: 18, padding: 20, minHeight: 260 }}>
          <div style={{ fontSize: 38 }}>{selected.icon}</div>
          <h3 style={{ margin: '8px 0', fontSize: 28 }}>{selected.title}</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{selected.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            {selected.tasks.map(task => (
              <div key={task} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, color: 'var(--text-muted)', background: 'rgba(0,0,0,.18)', fontSize: 13 }}>
                <span style={{ color: BLUE }}>●</span> {task}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
            <div style={{ border: '1px solid rgba(255,195,0,.18)', borderRadius: 12, padding: 12, background: 'rgba(255,195,0,.06)' }}>
              <strong>{t(dict, 'services.aiSuggestions', 'AI suggestions')}</strong>
              {selected.suggestions.map(suggestion => <p key={suggestion} style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>✦ {suggestion}</p>)}
            </div>
            <div style={{ border: '1px solid rgba(59,130,246,.18)', borderRadius: 12, padding: 12, background: 'rgba(59,130,246,.06)' }}>
              <strong>{t(dict, 'services.resultsPanel', 'Results panel')}</strong>
              {selected.results.map(result => <p key={result} style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>→ {result}</p>)}
            </div>
          </div>
          <Link href={selected.dashboardHref} className="sb-button-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
            {selected.cta} →
          </Link>
        </article>
      </div>
    </section>
  )
}
