// Acceptance evidence classifier. CI and live production prove different claims.
// Do not conflate green mocked UI suites with authenticated execution.
export function classifyCosAcceptance(input = {}) {
  const commit = String(input.commit || '').trim()
  const code = input.ci === 'passed' && input.playwright === 'passed'
    && input.ciCommit === commit && input.playwrightCommit === commit
    && /^[a-f0-9]{40}$/i.test(commit)
  const deployed = code && input.deployment === 'ready'
    && input.deploymentCommit === commit && input.deploymentUrlVerified === true
  const live = deployed && input.live === 'passed'
    && input.liveCommit === commit && input.authenticated === true
    && input.liveUnmocked === true && input.review === 'passed'
    && input.history === 'passed' && input.budget === 'passed'
  return Object.freeze({
    status: live ? 'END_TO_END_VERIFIED' : deployed ? 'PRODUCTION_VERIFIED' : code ? 'CODE_VERIFIED' : 'PARTIAL',
    code: code ? 'VERIFIED' : 'NOT_VERIFIED',
    production: deployed ? 'VERIFIED' : 'NOT_VERIFIED',
    endToEnd: live ? 'VERIFIED' : 'NOT_VERIFIED',
    operatorReviewRequired: deployed && !live,
    missing: Object.freeze([
      ...(!code ? ['commit_bound_ci_and_playwright'] : []),
      ...(!deployed ? ['verified_deployment_revision'] : []),
      ...(!live ? ['authenticated_unmocked_live_acceptance_and_review'] : []),
    ]),
  })
}
