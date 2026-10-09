// Enrollment routing policy. Address is an input to a proposed region, not a proof
// of residency. Account creation must obtain explicit acceptance and a configured target.
export const EU_EEA_COUNTRIES = new Set([
 'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
 'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO'
])
export type EnrollmentRegion = 'EU_EEA' | 'US'
export type RegionalTarget = { region: EnrollmentRegion; projectRef: string; ready: boolean }
export function proposedEnrollmentRegion(countryCode: string): EnrollmentRegion {
 const code=countryCode.trim().toUpperCase()
 if(!/^[A-Z]{2}$/.test(code)) throw new Error('enrollment_country_invalid')
 return EU_EEA_COUNTRIES.has(code) ? 'EU_EEA' : 'US'
}
export function selectEnrollmentTarget(input: {
 countryCode: string
 confirmedRegion: EnrollmentRegion | null
 targets: readonly RegionalTarget[]
}): RegionalTarget {
 const proposed=proposedEnrollmentRegion(input.countryCode)
 if(!input.confirmedRegion) throw new Error('enrollment_residency_confirmation_required')
 // A non-EU country can opt into EU residency; an EU/EEA registration cannot
 // silently downgrade to US hosting.
 if(proposed==='EU_EEA' && input.confirmedRegion!=='EU_EEA')
   throw new Error('enrollment_eu_residency_downgrade_blocked')
 const matches=input.targets.filter(target=>target.region===input.confirmedRegion)
 if(matches.length!==1 || !matches[0].ready || !/^[a-z0-9]{20}$/.test(matches[0].projectRef))
   throw new Error('enrollment_regional_target_unavailable')
 return matches[0]
}
