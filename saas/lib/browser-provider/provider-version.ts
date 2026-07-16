export const BPAL_SCHEMA_VERSION = '1.0.0' as const
export interface ProviderVersion { provider: string; capability: string; schema: typeof BPAL_SCHEMA_VERSION }
export function versionKey(v: ProviderVersion): string { return `${v.provider}|${v.capability}|${v.schema}` }
