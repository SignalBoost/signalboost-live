// saas/lib/hub/domains-types.ts
// DNS and domain record types

export interface DNSRecord {
  id: string
  domain: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA' | 'SRV'
  name: string // subdomain or @
  value: string
  ttl?: number
  priority?: number // For MX, SRV
  verified: boolean
  createdAt: string
  updatedAt: string
}

export interface Domain {
  id: string
  domain: string
  verified: boolean
  verificationCode?: string
  verificationMethod: 'dns' | 'file' | 'cname'
  nameservers: string[]
  registrar?: string
  expiresAt?: string
  autoRenew: boolean
  ssl?: {
    status: 'pending' | 'issued' | 'expired'
    certificate?: string
    issuer?: string
    issuedAt?: string
    expiresAt?: string
    autoRenew: boolean
  }
  records: DNSRecord[]
  createdAt: string
  updatedAt: string
}

export interface VercelDomain {
  name: string
  verified: boolean
  verification?: Array<{
    type: 'dns' | 'nameserver' | 'file'
    domain: string
    value: string
  }>
  createdAt: number
  updatedAt: number
  ssl?: {
    status: 'pending' | 'issued' | 'expired'
    created: number
    expiresAt: number
  }
}

export interface DNSCheckResult {
  domain: string
  recordType: string
  expected: string
  actual: string
  verified: boolean
  message: string
}

export interface SSLCertificate {
  domain: string
  issuer: string
  issuedAt: string
  expiresAt: string
  daysUntilExpiry: number
  status: 'valid' | 'expiring_soon' | 'expired'
  autoRenew: boolean
}

export interface DomainOperation {
  id: string
  domain: string
  operation: 'add' | 'verify' | 'update_records' | 'renew_ssl' | 'remove'
  status: 'pending' | 'in_progress' | 'success' | 'failed'
  startedAt: string
  completedAt?: string
  error?: string
  result?: Record<string, unknown>
}
