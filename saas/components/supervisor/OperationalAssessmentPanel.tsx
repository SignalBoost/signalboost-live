// saas/components/supervisor/OperationalAssessmentPanel.tsx
//
// TWO LAYERS, NOT ONE.
//
// The transparency was becoming its own problem. Rule identifiers, input fingerprints,
// independent-signal counts and reproducibility levels are exactly what makes this product
// defensible — and none of them is what an operator needs in the first four seconds. A page
// that shows everything at once has decided nothing, and hands the triage back to the reader.
//
// So the default view answers five questions and stops:
//
//   What is true now?      Operational state.
//   Is anyone affected?    Business impact.
//   Do I need to act?      Operator action, and whether this pages.
//   How sure are we?       Confidence, as one number.
//   What might change?     The risk headline, one line.
//
// EVERYTHING ELSE MOVES BEHIND "EXPLAIN THIS ASSESSMENT" — the basis, the confidence ledger,
// the forecast detail, assessment integrity, the execution model. Nothing is removed and
// nothing is summarised away: the disclosure holds the complete reasoning chain, so the answer
// to "why do you believe that?" is one click and never a different screen.
//
// This is the arrangement the whole rebuild was heading toward. A conclusion an operator can
// act on immediately, and a full justification behind it for the moment somebody challenges it.
//
// Nothing here computes anything. Every judgement arrives as a prop from a pure module, so
// the page and the modules cannot disagree.
//
// All visible copy goes through locale keys — an inline English fallback is a build failure.

import type { OperationalAssessment } from '@/lib/supervisor/operational-assessment'
import type { ForecastSet } from '@/lib/supervisor/risk-forecast'
import type { AssessmentIntegrity } from '@/lib/supervisor/assessment-integrity'

export type ExecutionModel = {
  model: string
  currentState: string
  observationState: string
  overdueBy: string
  tolerance: string
  escalatesIn: string
  lastCompleted: string
  lastResult: string
}

export type AssessmentVerification = {
  state: string
  lastAt: string
  unchangedAcross: string
}

export type EvidenceAgeView = {
  /** "32s" / "17m" / "2h 5m", composed by the page. */
  newest: string
  oldest: string
}

type Copy = Record<string, string>

export default function OperationalAssessmentPanel({
  assessment,
  forecast,
  execution,
  verification,
  integrity,
  evidenceAge,
  t,
}: {
  assessment: OperationalAssessment
  forecast: ForecastSet
  execution: ExecutionModel
  verification: AssessmentVerification
  integrity: AssessmentIntegrity
  evidenceAge: EvidenceAgeView
  t: Copy
}) {
  const exposureLabel: Record<string, string> = { low: t.exposureLow, medium: t.exposureMedium, high: t.exposureHigh }
  const tone =
    assessment.state === 'outage' ? '#ff5c7a' : assessment.state === 'service_degraded' ? '#ffd166' : '#38f2a4'

  return (
    <section style={panel}>
      <p style={kicker}>{t.assessmentKicker}</p>

      {/* ── THE DEFAULT VIEW. Five answers, nothing else. ─────────────────── */}
      <div style={headline}>
        <div>
          <p style={muted}>{t.currentState}</p>
          <p style={{ ...big, color: tone }}>{assessment.stateLabel}</p>
          <p style={muted}>{assessment.stateMeaning}</p>
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
          <p style={muted}>{t.confidenceMeaning}</p>
        </div>
      </div>

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
        </div>
        <div style={cell}>
          <p style={muted}>{t.riskForecast}</p>
          <p style={strong}>{forecast.headline}</p>
        </div>
      </div>

      {/* An integrity failure is the one thing that cannot wait behind a disclosure: it means
          the five answers above may themselves be wrong. */}
      {integrity.contradictions.length ? (
        <div style={alarmBlock}>
          <p style={sectionTitle}>{t.assessmentIntegrity}</p>
          <p style={strong}>{integrity.statement}</p>
          {integrity.contradictions.map(item => (
            <article key={item.code} style={mini}>
              <p style={strong}>{item.statement}</p>
              <p style={small}>{item.remedy}</p>
            </article>
          ))}
        </div>
      ) : null}

      {/* ── EVERYTHING ELSE. One click, and the complete reasoning chain. ──── */}
      <details style={explainBlock}>
        <summary style={summaryText}>{t.explainThisAssessment}</summary>

        {/* Why this state, and how fresh the conclusion is. */}
        <div style={block}>
          <p style={sectionTitle}>{t.conclusion}</p>
          <p style={small}>{assessment.stateReason}</p>
          <p style={small}>{assessment.whyAmISeeingThis}</p>
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
          <p style={muted}>{t.pagingRule}</p>
        </div>

        {/* The basis. */}
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
        </div>

        {/* The forecast, in full. */}
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

        {/* The confidence ledger, arithmetic visible. */}
        <div style={block}>
          <p style={sectionTitle}>{t.confidenceLedger}</p>
          <p style={small}>{assessment.confidenceStatement}</p>
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

        {/* Integrity: does the assessment hold together, and could someone else redo it. */}
        <div style={block}>
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
              <dt style={muted}>{t.newestEvidence}</dt>
              <dd style={dd}>{evidenceAge.newest}</dd>
            </div>
            <div>
              <dt style={muted}>{t.oldestEvidence}</dt>
              <dd style={dd}>{evidenceAge.oldest}</dd>
            </div>
            <div>
              <dt style={muted}>{t.evidenceAgeState}</dt>
              <dd style={dd}>{integrity.evidenceAge.stateLabel}</dd>
            </div>
          </dl>
          <p style={small}>{integrity.statement}</p>
          <details style={subcard}>
            <summary>{`${t.freshnessScore} · ${integrity.evidenceAge.score}%`}</summary>
            <ul style={list}>
              {integrity.evidenceAge.scoreBasis.map(line => (
                <li key={line} style={listItem}>
                  <span style={small}>{line}</span>
                </li>
              ))}
            </ul>
          </details>
          <dl style={fields}>
            <div>
              <dt style={muted}>{t.assessmentReproducibility}</dt>
              <dd style={dd}>{integrity.reproducibility.levelLabel}</dd>
            </div>
            <div>
              <dt style={muted}>{t.inputDigest}</dt>
              <dd style={dd}>{integrity.reproducibility.digest}</dd>
            </div>
          </dl>
          {integrity.reproducibility.reason ? <p style={small}>{integrity.reproducibility.reason}</p> : null}
          <p style={muted}>{integrity.reproducibility.roadmap}</p>
        </div>

        {/* How the thing runs, and where the observation stands. */}
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
      </details>
    </section>
  )
}

const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 20, background: 'rgba(255,255,255,.055)', marginBottom: 18 }
const headline = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, marginTop: 8 }
const row = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, marginTop: 18 }
const cell = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14 }
const block = { marginTop: 18, border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 16 }
const explainBlock = { marginTop: 18, border: '1px solid rgba(26,240,255,.28)', borderRadius: 16, padding: 16, background: 'rgba(26,240,255,.05)' }
const alarmBlock = { marginTop: 18, border: '1px solid rgba(255,92,122,.6)', borderRadius: 16, padding: 16, background: 'rgba(255,92,122,.08)' }
const forecastBlock = { marginTop: 18, border: '1px dashed rgba(255,209,102,.45)', borderRadius: 16, padding: 16, background: 'rgba(255,209,102,.05)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 12 }
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
const summaryText = { fontWeight: 800, cursor: 'pointer' as const, color: '#1af0ff' }
