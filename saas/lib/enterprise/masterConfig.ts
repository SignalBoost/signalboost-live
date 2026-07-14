import schema from '@/config/master_config_schema.json'

export type EnterpriseOption = {
  value: string
  label: string
  description?: string
}

export type EnterpriseRegion = {
  id: string
  label: string
  macro_region: string
}

export type EnterpriseConfigKey =
  | 'goals'
  | 'audiences'
  | 'tones'
  | 'regions'
  | 'industries'
  | 'roles'
  | 'platforms'
  | 'languages'
  | 'formats'
  | 'offer_types'
  | 'cta_strategies'

const config = schema.enterprise_config

function stringOptions(values: readonly string[]): EnterpriseOption[] {
  return values.map((value) => ({ value, label: value }))
}

export const enterpriseOptions: Record<EnterpriseConfigKey, EnterpriseOption[]> = {
  goals: stringOptions(config.goals),
  audiences: stringOptions(config.audiences),
  tones: stringOptions(config.tones),
  regions: (config.regions as EnterpriseRegion[]).map((region) => ({
    value: region.id,
    label: region.label,
    description: region.macro_region,
  })),
  industries: stringOptions(config.industries),
  roles: stringOptions(config.roles),
  platforms: stringOptions(config.platforms),
  languages: stringOptions(config.languages),
  formats: stringOptions(config.formats),
  offer_types: stringOptions(config.offer_types),
  cta_strategies: stringOptions(config.cta_strategies),
}

export const enterpriseInputPolicy = schema.input_policy

export function getEnterpriseOptions(key: EnterpriseConfigKey): EnterpriseOption[] {
  return enterpriseOptions[key]
}
