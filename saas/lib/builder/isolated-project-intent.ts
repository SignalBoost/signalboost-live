/** Scope comes from what the user asks to create, not incidental platform/publishing words. */
export function isExplicitIsolatedProjectBuild(input: string): boolean {
  const opening = String(input || '').trim().slice(0, 1000)
  const existingFreshBuild = /\b(?:build|create|implement|develop)\b[\s\S]{0,220}\b(?:from scratch|new isolated workspace|new workspace|new project)\b/i.test(opening)
    && /\b(?:application|app|project|system|service|website|tool)\b/i.test(opening)
  // Accept runtime qualifiers ("isolated Node.js repository") and explicit acceptance fixtures.
  // An explanation or platform feature request mentioning isolation is not a creation directive.
  const isolatedCreation = /(?:^|\n)\s*(?:please\s+)?(?:build|create|implement|develop|scaffold)\s+(?:a|an|the)\s+(?:(?:new|fresh|separate|independent)\s+)?isolated\s+(?:[\w.-]+\s+){0,5}(?:repository|repo|workspace|project|application|app|service|tool|website)\b/i.test(opening)
  return existingFreshBuild || isolatedCreation
}
