export const UNIVERSITY_TEACHER_LICENSE_POLICY_PROFILE = 'cos-university-teacher-license-policy-v1' as const

const ALLOWED_OPEN_MODEL_LICENSES = new Set(['apache-2.0', 'mit'])

export function normalizeTeacherLicense(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * Open-model teachers must permit commercial use and derivative/distillation use. Apache-2.0 and
 * MIT are currently the only automatically accepted license identifiers. Anything else fails
 * closed until legal/policy explicitly adds it.
 */
export function universityTeacherLicenseAllowed(value: unknown): boolean {
  return ALLOWED_OPEN_MODEL_LICENSES.has(normalizeTeacherLicense(value))
}

export function universityTeacherLicensePolicy() {
  return Object.freeze({
    profile: UNIVERSITY_TEACHER_LICENSE_POLICY_PROFILE,
    automaticallyAllowed: Object.freeze([...ALLOWED_OPEN_MODEL_LICENSES]),
    unknownLicenseAction: 'deny' as const,
    authorityExpanded: false,
  })
}
