export const COS_FLAGS_VERSION = 'cos.flags.v1' as const

export const COS_FLAG_NAMES = {
  customerReady: 'COS_CUSTOMER_READY',
  customerReadyPublic: 'NEXT_PUBLIC_COS_CUSTOMER_READY',
  adminPreview: 'COS_ADMIN_PREVIEW',
  indexable: 'COS_INDEXABLE',
} as const

export type CosFlagSnapshot = {
  customerReady: boolean
  adminPreview: boolean
  indexable: boolean
}

export function readBooleanFlag(name: string, fallback = false): boolean {
  const value = String(process.env[name] ?? '').trim().toLowerCase()
  if (!value) return fallback
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export function readCosFlags(): CosFlagSnapshot {
  const customerReady = readBooleanFlag(COS_FLAG_NAMES.customerReady) || readBooleanFlag(COS_FLAG_NAMES.customerReadyPublic)
  const adminPreview = readBooleanFlag(COS_FLAG_NAMES.adminPreview, true)
  const indexable = customerReady && readBooleanFlag(COS_FLAG_NAMES.indexable)

  return {
    customerReady,
    adminPreview,
    indexable,
  }
}
