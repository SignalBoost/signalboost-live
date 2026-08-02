// saas/components/supervisor/OperationalAssessmentPanel.tsx
//
// THE OPERATIONS VIEW. One audience, one question each, in the order an operations manager
// asks them:
//
//   1. What is true now?          Current state, from verified impact.
//   2. Is anyone affected?        Business impact, stated separately.
//   3. What must I do?            Operator action, and whether this pages.
//   4. What is that based on?     The assessment basis, including what limits it.
//   5. What might happen?         Risk forecast — clearly marked as conditional.
//   6. How sure are we?           Observation confidence, as a decomposable ledger.
//   7. How does this thing run?   Execution model, because "Leader: None" is the expected
//                                 steady state of a serverless runtime and reads as a fault.
//
// Nothing here computes anything. Every judgement arrives as a prop from a pure module, so
// the page and the modules cannot disagree.
//
// All visible copy goes through {t.key} expressions — literal JSX text is a
// hardcoded-copy guard violation and would fail the build.

import type { OperationalAssessment } from '@/lib/supervisor/operational-assessment'
import type { ForecastSet } from '@/lib/supervisor/risk-forecast'

export type ExecutionModel = {
  model: string
  currentState: string
  nextObservation: string
  lastCompleted: string
  lastResult: string
}

type Copy = Record<string, string>

export default function OperationalAssessmentPanel({
  assessment,
  forecast,
  execution,
  t,
}: {
  assessment: OperationalAssessment
  forecast: ForecastSet
  execution: ExecutionModel
  t: Copy
}) {
  const likelihoodLabel: Record<string, string> = { low: t.likelihoodLow, medium: t.likelihoodMedium, high: t.likelihoodHigh }
  const tone =
    assessment.state === 'outage' ? '#ff5c7a' : assessment.state === 'service_degraded' ? '#ffd166' : '#38f2a4'

  return (
    <section style={panel}>
      <p style={kicker}>{t.assessmentKicker}</p>

      {/* 1 + 2. State and impact, never merged into one number. */}
      <div style={headline}>
        <div>
          <p style={muted}>{t.currentState}</p>
          <p style={{ ...big, color: tone }}>{assessment.stateLabel}</p>
          <p style={muted}>{assessment.stateMeaning}</p>
          <p style={small}>{assessment.stateReason}</p>
          <p style={badge}>
            {assessment.stateVerified ? t.verifiedByCheck : t.partlyVerified}
          </p>
        </div>
        <div>
          <p style={muted}>{t.businessImpact}</p>
          <p style={{ ...big, color: assessment.impactAffected ? '#ffd166' : '#38f2a4' }}>
            {assessment.impactAffected ? t.impactAffected : t.impactNone}
          </p>
          <p style={small}>{assessment.impact}</p>
        </div>
        <div>
          <p style={muted}>{t.observationConfidence}</p>
          <p style={big}>{`${assessment.confidence}%`}</p>
          <p style={small}>{assessment.confidenceStatement}</p>
          <p style={muted}>{t.confidenceMeaning}</p>
        </div>
      </div>

      {/* 3. Action, and the paging decision, which state alone controls. */}
      <div style={row}>
        <div style={cell}>
          <p style={muted}>{t.operatorAction}</p>
          <p style={strong}>{assessment.operatorAction}</p>
        </div>
        <div style={cell}>
          <p style={muted}>{t.pageOnCall}</p>
          <p style={{ ...strong, color: assessment.pageOnCall ? '#ff5c7a' : '#38f2a4' }}>
            {assessment.pageOnCall ? t.yes : t.no}
          </p>
          <p style={muted}>{t.pagingRule}</p>
        </div>
      </div>

      {/* 4. The basis, directly under the conclusion rather than scattered across cards. */}
      <div style={block}>
        <p style={sectionTitle}>{t.assessmentBasis}</p>
        <p style={muted}>{assessment.basisStatement}</p>
        <ul style={list}>
          {assessment.assessmentBasis.map(line => (
            <li key={`${line.label}-${line.value}`} style={listItem}>
              <span style={muted}>{line.label}</span>
              <span style={strong}>{line.value}</span>
              {line.polarity === 'limits' ? (
                <span style={limitTag}>{t.limitsConclusion}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <p style={small}>{assessment.whyAmISeeingThis}</p>
      </div>

      {/* 5. The forecast, fenced off from everything above it. */}
      <div style={forecastBlock}>
        <p style={sectionTitle}>{t.riskForecast}</p>
        <p style={strong}>{forecast.headline}</p>
        <p style={muted}>{forecast.disclaimer}</p>
        {forecast.forecasts.map(item => (
          <article key={item.code} style={mini}>
            <p style={strong}>{item.observed}</p>
            <p style={small}>
              {item.trigger}
              {', '}
              {item.consequence}
            </p>
            <dl style={fields}>
              <div>
                <dt style={muted}>{t.likelihood}</dt>
                <dd style={dd}>{likelihoodLabel[item.likelihood]}</dd>
              </div>
              <div>
                <dt style={muted}>{t.horizon}</dt>
                <dd style={dd}>{item.horizon}</dd>
              </div>
              <div>
                <dt style={muted}>{t.clearsWhen}</dt>
                <dd style={dd}>{item.clearsWhen}</dd>
              </div>
              <div>
                <dt style={muted}>{t.forecastBasis}</dt>
                <dd style={dd}>{item.basis.join(' · ')}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {/* 6. Confidence, decomposed. A percentage nobody can take apart is decoration. */}
      {assessment.confidenceReasons.length ? (
        <details style={subcard}>
          <summary>{`${t.confidenceLedger} · ${assessment.confidenceReasons.length}`}</summary>
          {assessment.confidenceReasons.map(reason => (
            <article key={reason.code} style={mini}>
              <p style={strong}>{`${reason.label} · −${reason.penalty}`}</p>
              <p style={small}>{reason.why}</p>
              <p style={muted}>{`${t.restoredBy}: ${reason.remedy}`}</p>
            </article>
          ))}
        </details>
      ) : null}

      {/* 7. Execution model, replacing "Leader: None". */}
      <div style={block}>
        <p style={sectionTitle}>{t.executionModel}</p>
        <dl style={fields}>
          <div>
            <dt style={muted}>{t.model}</dt>
            <dd style={dd}>{execution.model}</dd>
          </div>
          <div>
            <dt style={muted}>{t.currentRuntimeState}</dt>
            <dd style={dd}>{execution.currentState}</dd>
          </div>
          <div>
            <dt style={muted}>{t.nextObservation}</dt>
            <dd style={dd}>{execution.nextObservation}</dd>
          </div>
          <div>
            <dt style={muted}>{t.lastCompleted}</dt>
            <dd style={dd}>{execution.lastCompleted}</dd>
          </div>
          <div>
            <dt style={muted}>{t.lastResult}</dt>
            <dd style={dd}>{execution.lastResult}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 20, background: 'rgba(255,255,255,.055)', marginBottom: 18 }
const headline = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, marginTop: 8 }
const row = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, marginTop: 18 }
const cell = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14 }
const block = { marginTop: 18, border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 16 }
const forecastBlock = { marginTop: 18, border: '1px dashed rgba(255,209,102,.45)', borderRadius: 16, padding: 16, background: 'rgba(255,209,102,.05)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 16 }
const mini = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 12, marginTop: 10 }
const fields = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 8 }
const dd = { margin: 0, wordBreak: 'break-word' as const }
const list = { listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }
const listItem = { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' as const }
const limitTag = { border: '1px solid rgba(255,209,102,.5)', color: '#ffd166', borderRadius: 999, padding: '2px 8px', fontSize: 12 }
const badge = { display: 'inline-block', border: '1px solid rgba(56,242,164,.4)', color: '#b8ffdd', borderRadius: 999, padding: '2px 10px', margin: '6px 0 0', fontSize: 12 }
const big = { margin: '4px 0', fontSize: 30, fontWeight: 800 }
const strong = { margin: '4px 0', fontWeight: 700 }
const small = { margin: '4px 0', color: 'rgba(255,255,255,.82)' }
const muted = { margin: '2px 0', color: 'rgba(255,255,255,.68)' }
const sectionTitle = { margin: 0, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1, fontSize: 12, color: '#1af0ff' }
const kicker = { color: '#1af0ff', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1, margin: 0 }
