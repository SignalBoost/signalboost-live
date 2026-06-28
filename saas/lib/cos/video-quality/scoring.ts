import { buildMarketingDecision, defaultMarketingDecisionInput } from '../marketing-decision'
import type { VideoQualityCandidate, VideoQualityComparison, VideoQualityFeature, VideoQualityScore } from './types'

const FEATURES: VideoQualityFeature[] = [
  'hero_selected',
  'format_selected',
  'visual_scene_design',
  'non_text_motion',
  'branded_url',
  'traffic_plan',
  'monetization_plan',
  'five_languages',
  'approval_gates',
  'mined_signals',
  'prediction_summary',
  'clear_cta',
]

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasItems(value: unknown, min = 1) {
  return Array.isArray(value) && value.length >= min
}

function grade(score: number): VideoQualityScore['grade'] {
  if (score >= 10) return 'marketing_grade_ready'
  if (score >= 7) return 'improved'
  if (score >= 4) return 'basic'
  return 'poor'
}

function passes(candidate: VideoQualityCandidate, feature: VideoQualityFeature) {
  switch (feature) {
    case 'hero_selected': return hasText(candidate.hero)
    case 'format_selected': return hasText(candidate.format)
    case 'visual_scene_design': return Boolean(candidate.scenes?.some(scene => hasText(scene.visual_direction)))
    case 'non_text_motion': return Boolean(candidate.scenes?.some(scene => /animate|motion|zoom|slide|cards|gauge|wave|transition/i.test(scene.visual_direction || '')))
    case 'branded_url': return /saas\.signalboostapp\.com/i.test(candidate.destination_url || candidate.call_to_action || '')
    case 'traffic_plan': return hasItems(candidate.traffic_plan)
    case 'monetization_plan': return hasItems(candidate.monetization_plan)
    case 'five_languages': return ['en', 'es', 'pt', 'pl', 'ru'].every(language => candidate.languages?.includes(language))
    case 'approval_gates': return hasItems(candidate.approval_gates)
    case 'mined_signals': return hasItems(candidate.mining_summary)
    case 'prediction_summary': return hasText(candidate.prediction_summary)
    case 'clear_cta': return hasText(candidate.call_to_action)
    default: return false
  }
}

export function scoreVideoCandidate(candidate: VideoQualityCandidate): VideoQualityScore {
  const passed = FEATURES.filter(feature => passes(candidate, feature))
  const failed = FEATURES.filter(feature => !passed.includes(feature))
  const score = passed.length

  return {
    candidate_id: candidate.id,
    label: candidate.label,
    score,
    max_score: FEATURES.length,
    grade: grade(score),
    passed_features: passed,
    failed_features: failed,
    notes: [
      `${candidate.label} scored ${score}/${FEATURES.length}.`,
      failed.length ? `Missing: ${failed.join(', ')}.` : 'All quality gates passed.',
    ],
  }
}

export function buildVideoQualityComparison(): VideoQualityComparison {
  const baseline: VideoQualityCandidate = {
    id: 'baseline_text_video',
    label: 'Baseline text-only video',
    title: 'SignalBoost campaign draft',
    scenes: [
      { label: 'Slide 1', narration: 'SignalBoost helps businesses grow.', visual_direction: 'Show text on screen.' },
      { label: 'Slide 2', narration: 'Visit the website to learn more.', visual_direction: 'Show text on screen.' },
    ],
    call_to_action: 'Visit the website.',
    languages: ['en'],
  }

  const decision = buildMarketingDecision(defaultMarketingDecisionInput())
  const cosa: VideoQualityCandidate = {
    id: 'cosa_decision_video',
    label: 'COSA decision-driven video',
    title: 'SignalBoost marketing-grade test draft',
    hero: decision.recommended_hero,
    format: decision.recommended_format,
    scenes: decision.recommended_scene_designs.map(scene => ({
      label: scene.replaceAll('_', ' '),
      narration: `Show the viewer why this ${scene.replaceAll('_', ' ')} matters for the selected niche.`,
      visual_direction: `Animate ${scene.replaceAll('_', ' ')} with motion cards, branded transitions, and product proof.`,
    })),
    destination_url: 'www.saas.signalboostapp.com',
    traffic_plan: decision.traffic_plan,
    monetization_plan: decision.monetization_plan,
    languages: ['en', 'es', 'pt', 'pl', 'ru'],
    approval_gates: decision.approval_required,
    mining_summary: decision.mining_summary,
    prediction_summary: decision.prediction_summary,
    call_to_action: 'Visit www.saas.signalboostapp.com and explore the SignalBoost console.',
  }

  const baselineScore = scoreVideoCandidate(baseline)
  const cosaScore = scoreVideoCandidate(cosa)
  const improvement = cosaScore.score - baselineScore.score

  return {
    baseline: baselineScore,
    cosa: cosaScore,
    improvement_points: improvement,
    verdict: improvement > 0
      ? `COSA improved the video strategy by ${improvement} quality point(s).`
      : 'COSA did not improve the video enough; adjust the decision engine before rendering.',
    next_actions: [
      'Open the COSA decision page and confirm the selected hero, format, and scene design.',
      'Open the motion preview and confirm URL, audio, waveform, and animation are visible.',
      'Generate one COSA video draft and compare it against this scorecard.',
      'Log views, clicks, watch time, and conversions after testing so future scores use real signals.',
    ],
  }
}
