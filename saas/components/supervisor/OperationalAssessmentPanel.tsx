// saas/components/supervisor/OperationalAssessmentPanel.tsx
//
// THE OPERATIONS VIEW. One audience, one question each, in the order an operations manager
// asks them:
//
//   1. What is true now?          Current state, from verified impact.
//   2. Is anyone affected?        Business impact, stated separately.
//   3. How fresh, and has it held?  The assessment's own verification state, timestamp, and
//                                 how many consecutive observations have not contradicted it.
//   4. What must I do?            Operator action, and whether this pages.
//   5. What is that based on?     The assessment basis, including what limits it.
//   6. What might happen?         Risk forecast — exposure and decision point, not prophecy.
//   7. How sure are we, exactly?  The confidence ledger, open, arithmetic visible.
//   8. Does the assessment hold?  Assessment integrity — independent signals, contradictions
//                                 between our own outputs, freshness, and reproducibility.
//   9. How does this thing run?   Execution model and where the observation actually stands.
//
// TWO THINGS THIS VERSION DELIBERATELY DOES NOT SAY.
//
//   "Likelihood" — that is a claim about probability and we have no probability model. What
//   we can measure is EXPOSURE: how much is at stake and how fast it would arrive.
//
//   "Due now" on its own — a scheduler's word that read as "on time" beside a missed window.
//   The execution block now states where the observation stands, its tolerance, and when it
//   escalates, so the operator never has to reconcile two lines that sounded contradictory.
//
// Nothing here computes anything. Every judgement arrives as a prop from a pure module, so
// the page and the modules cannot disagree.
//
// All visible copy goes through locale keys — an inline English fallback is a build failure.

import type { OperationalAssessment } from '@/lib/supervisor/operational-assessment'
import type { ForecastSet } from '@/lib/supervisor/risk-forecast'
import type { AssessmentIntegrity } from '@/lib/supervisor/assessment-integrity'

export type AssessmentVerification = {
  /** Verified / Partly verified. A state, not a sentence. */
  state: string
  /** When this assessment was computed. */
  lastAt: string
  /** "at least 50 observations · 4h 12m", composed by the page from the stability module. */
  unchangedAcross: string
}

export type ExecutionModel = {
  model: string
  currentState: string
  /** Localised label for the observation state: on schedule, overdue, absent. */
  observationState: string
  /** "4m past due" / "—". Composed by the page from the policy, never invented here. */
  overdueBy: string
  tolerance: string
  escalatesIn: string
  lastCompleted: string
  lastResult: string
}

type Copy = Record<string, string>

export default function OperationalAssessmentPanel({
  assessment,
  forecast,
  execution,
  verification,
  integrity,
  t,
}: {
  assessment: OperationalAssessment
  forecast: ForecastSet
  execution: ExecutionModel
  /** Whether the assessment holds together — answered before a buyer thinks to ask. */
  integrity: AssessmentIntegrity
  /** Freshness and continuity of THIS assessment. Operators ask how fresh the conclusion is
   *  and whether it has held — not when the last observation ran. Those differ whenever an
   *  observation is owed. */
  verification: AssessmentVerification
  t: Copy
}) {
  const exposureLabel: Record<string, string> = { low: t.exposureLow, medium: t.exposureMedium, high: t.exposureHigh }
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
          {/* 3. Verification and freshness of the CONCLUSION, as labelled fields. "Verified by
              check" was a sentence about our process; an operator wants a state and a time. */}
          <dl style={fields}>
            <div>
              <dt style={muted}>{t.assessmentVerification}</dt>
              <dd style={dd}>{verification.state}</dd>
            </div>
            <div>
              <dt style={muted}>{t.lastVerification}</dt>
              <dd style={dd}>{verification.lastAt}</dd>
            </div>
            <div>
              <dt style={muted}>{t.unchangedAcross}</dt>
              <dd style={dd}>{verification.unchangedAcross}</dd>
            </div>
          </dl>
          <p style={muted}>{t.stabilityNote}</p>
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

      {/* 4. Action, and the paging decision, which state alone controls. */}
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

      {/* 5. The basis, directly under the conclusion rather than scattered across cards. */}
      <div style={block}>
        <p style={sectionTitle}>{t.assessmentBasis}</p>
        <p style={muted}>{assessment.basisStatement}</p>
        <ul style={list}>
          {assessment.assessmentBasis.map(line => (
            <li key={`${line.label}-${line.value}`} style={listItem}>
              <span style={muted}>{line.label}</span>
              <span style={strong}>{line.value}</span>
              {line.polarity === 'limits' ? <span style={limitTag}>{t.limitsConclusion}</span> : null}
            </li>
          ))}
        </ul>
        <p style={small}>{assessment.whyAmISeeingThis}</p>
      </div>

      {/* 6. The forecast, fenced off from everything above it. */}
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
                <dt style={muted}>{t.exposure}</dt>
                <dd style={dd}>{exposureLabel[item.exposure]}</dd>
              </div>
              <div>
                <dt style={muted}>{t.decisionPoint}</dt>
                <dd style={dd}>{item.decisionPoint}</dd>
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

      {/* 7. The confidence ledger, OPEN. A percentage folded behind a disclosure triangle is
          still asking to be believed; one that shows 100 minus its reasons can be audited. */}
      <div style={block}>
        <p style={sectionTitle}>{t.confidenceLedger}</p>
        <ul style={list}>
          <li style={listItem}>
            <span style={muted}>{t.startingConfidence}</span>
            <span style={strong}>{'100'}</span>
          </li>
          {assessment.confidenceReasons.map(reason => (
            <li key={reason.code} style={ledgerItem}>
              <p style={strong}>{`−${reason.penalty} · ${reason.label}`}</p>
              <p style={small}>{reason.why}</p>
              <p style={muted}>{`${t.restoredBy}: ${reason.remedy}`}</p>
            </li>
          ))}
          {assessment.confidenceReasons.length === 0 ? (
            <li style={listItem}>
              <span style={small}>{t.noConfidenceDeductions}</span>
            </li>
          ) : null}
          <li style={listItem}>
            <span style={muted}>{t.finalConfidence}</span>
            <span style={strong}>{`${assessment.confidence}%`}</span>
          </li>
        </ul>
      </div>

      {/* 8. Integrity. This block is capable of saying the console is wrong, and says so in the
          same place it would otherwise be reassuring. */}
      <div style={integrity.contradictions.length ? alarmBlock : block}>
        <p style={sectionTitle}>{t.assessmentIntegrity}</p>
        <dl style={fields}>
          <div>
            <dt style={muted}>{t.independentSignals}</dt>
            <dd style={dd}>{integrity.signalsLabel}</dd>
          </div>
          <div>
            <dt style={muted}>{t.conflictingSignals}</dt>
            <dd style={dd}>{String(integrity.conflictingSignals)}</dd>
          </div>
          <div>
            <dt style={muted}>{t.evidenceFreshness}</dt>
            <dd style={dd}>{`${integrity.evidenceFreshness}%`}</dd>
          </div>
          <div>
            <dt style={muted}>{t.assessmentReproducible}</dt>
            <dd style={dd}>{integrity.inputsRetained ? t.yes : t.reproducibleInPrinciple}</dd>
          </div>
          <div>
            <dt style={muted}>{t.inputDigest}</dt>
            <dd style={dd}>{integrity.inputDigest}</dd>
          </div>
        </dl>
        <p style={small}>{integrity.statement}</p>
        <p style={muted}>{integrity.reproducibilityStatement}</p>
        {integrity.contradictions.map(item => (
          <article key={item.code} style={mini}>
            <p style={strong}>{item.statement}</p>
            <p style={small}>{item.remedy}</p>
          </article>
        ))}
      </div>

      {/* 9. Execution model and where the observation stands, replacing "Leader: None". */}
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
            <dt style={muted}>{t.observationStateLabel}</dt>
            <dd style={dd}>{execution.observationState}</dd>
          </div>
          <div>
            <dt style={muted}>{t.overdueBy}</dt>
            <dd style={dd}>{execution.overdueBy}</dd>
          </div>
          <div>
            <dt style={muted}>{t.tolerance}</dt>
            <dd style={dd}>{execution.tolerance}</dd>
          </div>
          <div>
            <dt style={muted}>{t.escalatesIn}</dt>
            <dd style={dd}>{execution.escalatesIn}</dd>
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
const alarmBlock = { marginTop: 18, border: '1px solid rgba(255,92,122,.6)', borderRadius: 16, padding: 16, background: 'rgba(255,92,122,.08)' }
const forecastBlock = { marginTop: 18, border: '1px dashed rgba(255,209,102,.45)', borderRadius: 16, padding: 16, background: 'rgba(255,209,102,.05)' }
const mini = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 12, marginTop: 10 }
const fields = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 8 }
const dd = { margin: 0, wordBreak: 'break-word' as const }
const list = { listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }
const listItem = { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' as const }
const ledgerItem = { borderLeft: '2px solid rgba(255,209,102,.5)', paddingLeft: 10 }
const limitTag = { border: '1px solid rgba(255,209,102,.5)', color: '#ffd166', borderRadius: 999, padding: '2px 8px', fontSize: 12 }
const big = { margin: '4px 0', fontSize: 30, fontWeight: 800 }
const strong = { margin: '4px 0', fontWeight: 700 }
const small = { margin: '4px 0', color: 'rgba(255,255,255,.82)' }
const muted = { margin: '2px 0', color: 'rgba(255,255,255,.68)' }
const sectionTitle = { margin: 0, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1, fontSize: 12, color: '#1af0ff' }
const kicker = { color: '#1af0ff', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1, margin: 0 }
