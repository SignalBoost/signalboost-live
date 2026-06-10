'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

type AnalyticsEvent = {
  event_id: string
  user_id: string | null
  step_name: string | null
  action: string | null
  timestamp: string | null
  device_type: string | null
  browser: string | null
}

type UserProfile = {
  user_id: string
  role: string | null
  it_level: string | null
  tone_preference: string | null
  consent_ai_training: boolean | null
  onboarding_completed: boolean | null
  onboarding_completed_at: string | null
}

type ErrorLog = {
  error_id: string
  error_type: string | null
  timestamp: string | null
  device_type: string | null
}

type Feedback = {
  feedback_id: string
  response: string | null
  timestamp: string | null
}

const STEP_ORDER = ['welcome', 'profiling', 'consent', 'tone', 'confirmation']
const COLORS = ['#38bdf8', '#ffc300', '#a78bfa', '#22c55e', '#fb7185']

function percent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function groupCount(items: Array<Record<string, string | null>>, key: string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const group = item[key] || 'unknown'
    acc[group] = (acc[group] || 0) + 1
    return acc
  }, {})
}

export default function OnboardingAnalyticsDashboardPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      const [eventResult, profileResult, errorResult, feedbackResult] = await Promise.all([
        supabase.from('onboarding_analytics').select('*').order('timestamp', { ascending: false }).limit(500),
        supabase.from('user_profile').select('*').order('onboarding_completed_at', { ascending: false }).limit(500),
        supabase.from('error_logs').select('error_id,error_type,timestamp,device_type').order('timestamp', { ascending: false }).limit(50),
        supabase.from('feedback').select('feedback_id,response,timestamp').order('timestamp', { ascending: false }).limit(100),
      ])

      setEvents((eventResult.data || []) as AnalyticsEvent[])
      setProfiles((profileResult.data || []) as UserProfile[])
      setErrors((errorResult.data || []) as ErrorLog[])
      setFeedback((feedbackResult.data || []) as Feedback[])
      setLoading(false)
    }

    loadDashboard()
  }, [])

  const completedProfiles = profiles.filter((profile) => profile.onboarding_completed)
  const consentedProfiles = profiles.filter((profile) => profile.consent_ai_training)
  const viewedEvents = events.filter((event) => event.action === 'viewed')
  const completedEvents = events.filter((event) => event.action === 'completed')
  const skippedEvents = events.filter((event) => event.action === 'skipped')

  const stepViews = useMemo(() => groupCount(viewedEvents as Array<Record<string, string | null>>, 'step_name'), [viewedEvents])
  const toneDistribution = useMemo(() => groupCount(profiles as unknown as Array<Record<string, string | null>>, 'tone_preference'), [profiles])
  const deviceDistribution = useMemo(() => groupCount(events as unknown as Array<Record<string, string | null>>, 'device_type'), [events])
  const feedbackDistribution = useMemo(() => groupCount(feedback as unknown as Array<Record<string, string | null>>, 'response'), [feedback])
  const maxStepViews = Math.max(1, ...Object.values(stepViews))

  return (
    <main className="dashboardShell">
      <style>{`
        .dashboardShell { color: #fff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        .dashboardShell .hero { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-end; border-bottom: 1px solid rgba(255,255,255,.09); padding-bottom: .8rem; margin-bottom: 1.1rem; }
        .dashboardShell h1 { font-size: 22px; font-weight: 950; line-height: 1.1; letter-spacing: -.045em; margin: 4px 0 4px; color: #fff; }
        .dashboardShell p, .dashboardShell span { color: rgba(255,255,255,.66); }
        .dashboardShell .grid { display: grid; gap: 1rem; }
        .dashboardShell .kpiGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 1rem; }
        .dashboardShell .panelGrid { grid-template-columns: 1.2fr .8fr; align-items: start; }
        .dashboardShell .card { border: 0; border-top: 1px solid rgba(255,255,255,.08); border-radius: 0; background: transparent; box-shadow: none; padding: .9rem 0 0; }
        .dashboardShell .kpi { border-top: 0; border-left: 2px solid rgba(26,240,255,.4); padding: 0 0 0 .85rem; }
        .dashboardShell .kpi strong { display: block; font-size: clamp(1.4rem, 3vw, 2rem); letter-spacing: -.03em; color: #9ff7ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .barRow { display: grid; grid-template-columns: 8rem 1fr 4rem; gap: .75rem; align-items: center; margin: .9rem 0; }
        .barTrack { height: .8rem; border-radius: 999px; background: rgba(255,255,255,.09); overflow: hidden; }
        .barFill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #ffc300); }
        .donutList { display: grid; gap: .8rem; }
        .legend { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,.09); padding-bottom: .6rem; }
        .dot { display: inline-block; width: .65rem; height: .65rem; border-radius: 999px; margin-right: .4rem; }
        .taskList { display: grid; gap: .65rem; padding: 0; margin: .5rem 0 0; list-style: none; }
        .dashboardShell .taskList li { border: 0; border-top: 1px solid rgba(255,255,255,.07); border-left: 2px solid rgba(56,189,248,.4); padding: .7rem 0 .7rem .8rem; }
        .statusPill { display: inline-flex; border-radius: 999px; padding: .35rem .65rem; background: rgba(34,197,94,.12); color: #86efac; font-size: .82rem; font-weight: 800; }
        .table { width: 100%; border-collapse: collapse; font-size: .9rem; }
        .table th, .table td { text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); padding: .75rem .5rem; }
        .table th { color: rgba(255,255,255,.48); font-size: .75rem; text-transform: uppercase; letter-spacing: .12em; }
        @media (max-width: 980px) { .kpiGrid, .panelGrid { grid-template-columns: 1fr 1fr; } .hero { align-items: flex-start; flex-direction: column; } }
        @media (max-width: 680px) { .kpiGrid, .panelGrid { grid-template-columns: 1fr; } .barRow { grid-template-columns: 1fr; gap: .35rem; } }
      `}</style>

      <section className="hero">
        <div>
          <span className="statusPill">Live onboarding analytics</span>
          <h1>Onboarding Command Center</h1>
          <p style={{ fontSize: 13, margin: 0 }}>Completion, funnel drop-off, consent, tone, QA, feedback, A/B readiness.</p>
        </div>
        <p>{loading ? 'Loading data…' : `${events.length} events analyzed`}</p>
      </section>

      <section className="grid kpiGrid" aria-label="Onboarding KPIs">
        <div className="card kpi"><span>Completion rate</span><strong>{percent(completedProfiles.length, profiles.length)}</strong><p>{completedProfiles.length} completed / {profiles.length} profiled</p></div>
        <div className="card kpi"><span>Consent opt-in</span><strong>{percent(consentedProfiles.length, profiles.length)}</strong><p>{consentedProfiles.length} training consents captured</p></div>
        <div className="card kpi"><span>Skips</span><strong>{skippedEvents.length}</strong><p>Skip button events across the flow</p></div>
        <div className="card kpi"><span>Errors</span><strong>{errors.length}</strong><p>Recent onboarding client/server errors</p></div>
      </section>

      <section className="grid panelGrid">
        <div className="card">
          <h2>Funnel drop-off by step</h2>
          {STEP_ORDER.map((step, index) => (
            <div className="barRow" key={step}>
              <strong>{index + 1}. {step}</strong>
              <div className="barTrack"><div className="barFill" style={{ width: percent(stepViews[step] || 0, maxStepViews) }} /></div>
              <span>{stepViews[step] || 0} views</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Tone distribution</h2>
          <div className="donutList">
            {Object.entries(toneDistribution).map(([tone, count], index) => (
              <div className="legend" key={tone}><span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{tone}</span><strong>{count}</strong></div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Monitoring setup</h2>
          <ul className="taskList">
            <li><strong>Analytics tracking:</strong> onboarding events are sent to the custom Supabase event table, plus Google Analytics, Mixpanel, and LogRocket when browser SDKs are present.</li>
            <li><strong>Error logging:</strong> client exceptions are forwarded to Sentry and LogRocket when configured; recent database-backed errors are surfaced here.</li>
            <li><strong>Performance monitoring:</strong> QA should validate Lighthouse mobile performance and compare event timestamps for slow step transitions.</li>
            <li><strong>Feedback loop:</strong> yes/no feedback distribution appears below for post-onboarding satisfaction checks.</li>
            <li><strong>Compliance & privacy:</strong> consent opt-in remains unchecked by default and is timestamped in user profile records.</li>
          </ul>
        </div>

        <div className="card">
          <h2>Device mix</h2>
          <div className="donutList">
            {Object.entries(deviceDistribution).map(([device, count], index) => (
              <div className="legend" key={device}><span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{device}</span><strong>{count}</strong></div>
            ))}
          </div>
          <h2 style={{ marginTop: '1.25rem' }}>Feedback</h2>
          <div className="donutList">
            {Object.entries(feedbackDistribution).map(([response, count], index) => (
              <div className="legend" key={response}><span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{response}</span><strong>{count}</strong></div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>User-facing QA script</h2>
          <ul className="taskList">
            <li>Verify the skip button appears on every onboarding step and routes to the dashboard.</li>
            <li>Confirm profiling selections persist after reload and re-opening onboarding.</li>
            <li>Confirm consent is unchecked by default and only timestamps when opted in.</li>
            <li>Verify tone persistence appears in the confirmation summary and user profile settings.</li>
            <li>Test responsiveness at mobile, tablet, and desktop widths.</li>
            <li>Run performance and cross-browser checks in Chrome, Safari, Firefox, and Edge.</li>
          </ul>
        </div>

        <div className="card">
          <h2>Developer verification checklist</h2>
          <ul className="taskList">
            <li>Responsive units, fluid grids, touch-friendly 44px controls, and media queries are present.</li>
            <li>Glassmorphism panels and neon accents match SignalBoost visual language.</li>
            <li>Skip logic, profile upsert, consent handling, tone persistence, and analytics insert paths complete without console errors.</li>
            <li>Apprentice Workshop adapts copy and task depth from the stored IT level.</li>
            <li>Keyboard focus, semantic labels, color contrast, and reduced layout shift are verified.</li>
          </ul>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Recent onboarding events</h2>
        <table className="table">
          <thead><tr><th>Step</th><th>Action</th><th>Device</th><th>Browser</th><th>Timestamp</th></tr></thead>
          <tbody>
            {events.slice(0, 10).map((event) => (
              <tr key={event.event_id}><td>{event.step_name}</td><td>{event.action}</td><td>{event.device_type}</td><td>{event.browser}</td><td>{event.timestamp}</td></tr>
            ))}
            {!events.length && <tr><td colSpan={5}>No onboarding events found yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>A/B testing layout</h2>
        <p>Use variant tags in <code>onboarding_analytics.action</code> values such as <code>viewed_variant_a</code> or <code>viewed_variant_b</code>, then compare completion, consent opt-in, and feedback response rates in this dashboard.</p>
        <p>Confirmation completions tracked: {completedEvents.length}</p>
      </section>
    </main>
  )
}
