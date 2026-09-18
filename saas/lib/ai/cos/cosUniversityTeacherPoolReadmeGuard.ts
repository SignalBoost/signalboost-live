// Enterprise invariant marker used by repo QA: University teacher providers are replaceable buyer-owned
// dependencies. Provider selection is configuration, never a source migration, and no silent fallback is allowed.
export const COS_UNIVERSITY_TEACHER_PORTABILITY_INVARIANT = Object.freeze({
  buyerOwnedCredentials: true,
  providerLockIn: false,
  silentFallbackAllowed: false,
  providerSelectionIsConfiguration: true,
  authorityExpanded: false,
})
