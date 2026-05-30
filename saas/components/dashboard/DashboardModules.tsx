'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES, type ServiceKey } from '@/lib/services/catalog'


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
    <section className="fathom-glass sb-cockpit-panel" style={{ borderRadius: 18, padding: 'var(--sb-space-lg)', marginBottom: 'var(--sb-space-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sb-space-md)', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 'var(--sb-space-md)' }}>
        <div>
          <div className="terminal-text sb-eyebrow sb-neon-text-gold">
            {t(dict, 'dashboard_modules.kicker', 'Workspace modules')}
          </div>
          <h2 className="sb-h3" style={{ margin: 'var(--sb-space-sm) 0 0' }}>{t(dict, 'dashboard_modules.title', 'Choose what to build next')}</h2>
        </div>
        <Link href="/faq" className="terminal-text" style={{ color: '#fff', textDecoration: 'none', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '9px 13px', fontSize: 12, fontWeight: 700 }}>
          ❓ {t(dict, 'support.faq', 'FAQ')}
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, .8fr) minmax(260px, 1.2fr)', gap: 'var(--sb-space-md)' }} className="dashboard-module-grid">
        <div style={{ display: 'grid', gap: 'var(--sb-space-sm)' }}>
          {modules.map(module => {
            const isActive = module.key === active
            return (
              <button
                key={module.key}
                type="button"
                onClick={() => setActive(module.key)}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${isActive ? 'rgba(255,215,0,.55)' : 'var(--border-soft)'}`,
                  background: isActive ? 'rgba(255,215,0,.12)' : 'var(--sb-glass-background)' ,
                  color: '#fff',
                  borderRadius: 14,
                  padding: 'var(--sb-space-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 'var(--sb-space-sm)',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 20 }}>{module.icon}</span>
                <span style={{ fontWeight: 'var(--sb-font-weight-bold)' }}>{module.title}</span>
              </button>
            )
          })}
        </div>

        <article className="sb-telemetry-card" style={{ border: `1px solid rgba(0,255,255,.28)`, background: 'linear-gradient(135deg, rgba(0,255,255,.12), rgba(255,215,0,.06))', borderRadius: 18, padding: 'var(--sb-space-lg)', minHeight: 260 }}>
          <div style={{ fontSize: 38 }}>{selected.icon}</div>
          <h3 className="sb-h2" style={{ margin: 'var(--sb-space-sm) 0' }}>{selected.title}</h3>
          <p className="sb-body" style={{ margin: '0 0 var(--sb-space-md)' }}>{selected.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sb-space-sm)', marginBottom: 'var(--sb-space-lg)'  }}>
            {selected.tasks.map(task => (
              <div key={task} className="sb-cockpit-panel" style={{ borderRadius: 12, padding: 'var(--sb-space-sm)', color: 'var(--text-muted)', background: 'rgba(0,0,0,.18)', fontSize: 13 }}>
                <span className="sb-neon-text-cyan">●</span> {task}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sb-space-sm)', marginBottom: 'var(--sb-space-lg)'  }}>
            <div className="sb-cockpit-panel" style={{ border: '1px solid rgba(255,215,0,.22)', borderRadius: 12, padding: 'var(--sb-space-md)', background: 'rgba(255,215,0,.06)' }}>
              <strong>{t(dict, 'services.aiSuggestions', 'AI suggestions')}</strong>
              {selected.suggestions.map(suggestion => <p key={suggestion} style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>✦ {suggestion}</p>)}
            </div>
            <div className="sb-cockpit-panel" style={{ border: '1px solid rgba(0,255,255,.22)', borderRadius: 12, padding: 'var(--sb-space-md)', background: 'rgba(0,255,255,.06)' }}>
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
