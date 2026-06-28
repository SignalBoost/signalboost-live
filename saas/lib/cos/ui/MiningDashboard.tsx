'use client'

// saas/lib/cos/ui/MiningDashboard.tsx
// Portable admin cockpit for the COS mining + predictive module. Client component; fully
// localized via cosT(lang, …) — zero hard-coded English. Endpoint URLs are props (default
// to the SignalBoost host bindings) so the component drops into any host. Server-only
// modules are imported as TYPES only, so no DB code is bundled into the client.

import { useCallback, useEffect, useState } from 'react'
import { cosT, localizeFeatureName } from '../i18n'
import type { MiningOverview } from '../overview'
import type { Prediction, PropensityScores } from '../predictive'
import type { FeatureRecord } from '../mining/types'

export interface MiningDashboardProps {
  lang: string
  overviewUrl?: string
  predictUrlBase?: string // `${base}/{id}` is fetched
  isAdmin?: boolean
}

type PredictResponse = {
  ok: boolean
  predictions?: Prediction[]
  propensity?: PropensityScores
  features?: FeatureRecord[]
  error?: string
}

const card = 'rounded-md border border-border bg-surface p-4'
const label = 'text-[10px] font-semibold uppercase tracking-wider text-text-muted'

export default function MiningDashboard({
  lang,
  overviewUrl = '/api/cos/mining/overview',
  predictUrlBase = '/api/predict/user',
  isAdmin = true,
}: MiningDashboardProps) {
  const T = (p: string, f?: string) => cosT(lang, p, f)
  const [data, setData] = useState<MiningOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(overviewUrl, { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setDenied(true); setData(null); return }
      const j = await res.json()
      setData(j.overview ?? null)
      setDenied(false)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [overviewUrl])

  useEffect(() => { if (isAdmin) load(); else { setDenied(true); setLoading(false) } }, [isAdmin, load])

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(lang) : T('dashboard.never')

  return (
    <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">{T('mining.title')}</h1>
            <p className="mt-1.5 max-w-[640px] text-sm leading-relaxed text-text-muted">{T('mining.subtitle')}</p>
          </div>
          <button
            onClick={load}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110"
          >
            {T('dashboard.refresh')}
          </button>
        </div>

        {denied && (
          <div className={card}>
            <p className="text-sm text-text-muted">{T('dashboard.no_access')}</p>
          </div>
        )}

        {!denied && loading && (
          <div className={card}><p className="text-sm text-text-muted">…</p></div>
        )}

        {!denied && !loading && data && (
          <div className="flex flex-col gap-4">
            {/* Latest run stat strip */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={T('mining.events_scanned')} value={data.latestRun?.events_scanned ?? 0} />
              <Stat label={T('mining.users_processed')} value={data.latestRun?.users_processed ?? 0} />
              <Stat label={T('mining.features_written')} value={data.latestRun?.features_written ?? 0} />
              <Stat label={T('mining.rules_found')} value={data.latestRun?.rules_found ?? 0} />
            </div>
            <p className="text-xs text-text-muted">
              {T('mining.last_run')}: {fmtTime(data.latestRun?.started_at ?? null)}
              {data.latestRun?.status ? ` · ${T('status.' + data.latestRun.status, data.latestRun.status)}` : ''}
            </p>

            {/* Segment distribution */}
            <section className={card}>
              <div className={label + ' mb-3'}>{T('dashboard.segment_distribution')}</div>
              {data.segmentDistribution.length === 0 ? (
                <p className="text-sm text-text-muted">{T('empty.no_features')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.segmentDistribution.map((s) => {
                    const max = Math.max(...data.segmentDistribution.map((x) => x.count)) || 1
                    return (
                      <div key={s.segment} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs text-text-muted">{T('segments.cluster')} {s.segment}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(s.count / max) * 100}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right text-xs text-text-muted">{s.count} {T('dashboard.users')}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Top patterns */}
            <section className={card}>
              <div className={label + ' mb-3'}>{T('dashboard.top_patterns')}</div>
              {data.topRules.length === 0 ? (
                <p className="text-sm text-text-muted">{T('empty.no_rules')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                        <th className="py-1.5 pr-3 font-semibold">{T('rules.if')}</th>
                        <th className="py-1.5 pr-3 font-semibold">{T('rules.then')}</th>
                        <th className="py-1.5 pr-3 text-right font-semibold">{T('rules.confidence')}</th>
                        <th className="py-1.5 text-right font-semibold">{T('rules.lift')}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[12px]">
                      {data.topRules.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1.5 pr-3 text-text-muted">{r.antecedent.join(' + ')}</td>
                          <td className="py-1.5 pr-3 text-text">{r.consequent.join(' + ')}</td>
                          <td className="py-1.5 pr-3 text-right">{(r.confidence * 100).toFixed(0)}%</td>
                          <td className="py-1.5 text-right">{r.lift.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* User lookup */}
            <UserLookup lang={lang} predictUrlBase={predictUrlBase} />

            {/* Run history */}
            <section className={card}>
              <div className={label + ' mb-3'}>{T('dashboard.run_history')}</div>
              {data.recentRuns.length === 0 ? (
                <p className="text-sm text-text-muted">{T('empty.no_runs')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <tbody className="text-[12px]">
                      {data.recentRuns.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="py-1.5 pr-3 text-text-muted">{fmtTime(r.started_at)}</td>
                          <td className="py-1.5 pr-3">{r.job}</td>
                          <td className="py-1.5 pr-3">{T('status.' + r.status, r.status)}</td>
                          <td className="py-1.5 pr-3 text-right text-text-muted">{r.users_processed} {T('dashboard.users')}</td>
                          <td className="py-1.5 text-right text-text-muted">{r.rules_found} {T('nav.rules').toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label: l, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <div className={label}>{l}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-text">{value.toLocaleString()}</div>
    </div>
  )
}

function UserLookup({ lang, predictUrlBase }: { lang: string; predictUrlBase: string }) {
  const T = (p: string, f?: string) => cosT(lang, p, f)
  const [uid, setUid] = useState('')
  const [res, setRes] = useState<PredictResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!uid.trim()) return
    setBusy(true)
    try {
      const r = await fetch(`${predictUrlBase}/${encodeURIComponent(uid.trim())}`, { cache: 'no-store' })
      setRes(await r.json())
    } catch {
      setRes({ ok: false, error: 'load_failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={card}>
      <div className={label + ' mb-3'}>{T('dashboard.lookup_user')}</div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder={T('dashboard.user_id_placeholder')}
          className="min-w-[240px] flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <button
          onClick={run}
          disabled={busy}
          className="rounded-md border border-border bg-surfaceElevated px-4 py-2 text-sm font-semibold text-text transition-fast hover:border-accent disabled:opacity-50"
        >
          {T('dashboard.view')}
        </button>
      </div>

      {res && res.ok && (
        <div className="mt-4 flex flex-col gap-4">
          {res.propensity && (
            <div className="grid grid-cols-3 gap-3">
              <Meter label={T('predict.engagement')} v={res.propensity.engagement} />
              <Meter label={T('predict.churn_risk')} v={res.propensity.churn_risk} />
              <Meter label={T('predict.value')} v={res.propensity.value} />
            </div>
          )}
          <div>
            <div className={label + ' mb-2'}>{T('predict.title')}</div>
            {!res.predictions || res.predictions.length === 0 ? (
              <p className="text-sm text-text-muted">{T('predict.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {res.predictions.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-sm">
                    <span className="font-mono text-[12px] text-text">{p.action}</span>
                    <span className="text-xs text-text-muted">{(p.score * 100).toFixed(0)}% · {p.basis}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {res.features && res.features.length > 0 && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {res.features.map((f) => (
                <div key={f.feature_name} className="rounded-md border border-border bg-bg px-3 py-2">
                  <div className="text-[10px] text-text-muted">{localizeFeatureName(lang, f.feature_name)}</div>
                  <div className="text-sm tabular-nums text-text">{Math.round(f.value).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {res && !res.ok && <p className="mt-3 text-sm text-danger">{T('errors.load_failed')}</p>}
    </section>
  )
}

function Meter({ label: l, v }: { label: string; v: number }) {
  return (
    <div className="rounded-md border border-border bg-bg px-3 py-2">
      <div className="text-[10px] text-text-muted">{l}</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(v * 100)}%` }} />
      </div>
      <div className="mt-1 text-xs tabular-nums text-text-muted">{Math.round(v * 100)}%</div>
    </div>
  )
}
