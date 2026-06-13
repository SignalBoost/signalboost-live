// saas/lib/hub/vault-types.ts
// Key Vault v2 — Credential management types and schemas.

export type VaultSecretStatus = 'active' | 'expiring_soon' | 'expired' | 'rotated' | 'revoked'
export type VaultSecretType = 'api_key' | 'token' | 'password' | 'oauth2' | 'certificate' | 'ssh_key'
export type VaultActionType = 'created' | 'rotated' | 'accessed' | 'revoked' | 'failed_access'

export type VaultSecret = {
  id: string
  provider_id: string
  provider_name: string
  secret_type: VaultSecretType
  secret_name: string
  masked_value: string // e.g., "sk_live_4J3...Xx2" (first 8 + last 4 chars visible)
  created_at: string
  updated_at: string
  expires_at?: string
  last_rotated_at?: string
  last_accessed_at?: string
  status: VaultSecretStatus
  tags?: string[]
  environment?: 'production' | 'staging' | 'development'
}

export type VaultAuditLog = {
  id: string
  secret_id: string
  action: VaultActionType
  user_id?: string
  user_email?: string
  timestamp: string
  ip_address?: string
  status: 'success' | 'failed'
  message: string
}

export type VaultRotationPolicy = {
  id: string
  secret_id: string
  enabled: boolean
  rotation_interval_days: number
  last_rotation: string
  next_rotation: string
  auto_rotate: boolean
  notify_before_days: number
}

export type VaultExpirationAlert = {
  id: string
  secret_id: string
  days_until_expiry: number
  severity: 'info' | 'warning' | 'critical'
  notified_at?: string
  dismissed_at?: string
}

export type VaultUnlockSession = {
  session_id: string
  user_id: string
  unlocked_at: string
  expires_at: string
  mfa_verified: boolean
  ip_address?: string
}

export type VaultStats = {
  total_secrets: number
  active_secrets: number
  expiring_soon: number // Next 30 days
  expired: number
  last_rotation: string
  next_rotation: string
}

// Supabase schema (for reference):
export const VAULT_SCHEMA = `
-- hub_vault_secrets table
CREATE TABLE IF NOT EXISTS hub_vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  secret_type TEXT NOT NULL CHECK (secret_type IN ('api_key', 'token', 'password', 'oauth2', 'certificate', 'ssh_key')),
  secret_name TEXT NOT NULL,
  masked_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP,
  last_rotated_at TIMESTAMP,
  last_accessed_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired', 'rotated', 'revoked')),
  tags TEXT[],
  environment TEXT CHECK (environment IN ('production', 'staging', 'development')),
  encrypted_value TEXT, -- Encrypted full secret (not readable by this app until decrypted)
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(provider_id, secret_name)
);

-- hub_vault_audit_log table
CREATE TABLE IF NOT EXISTS hub_vault_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID REFERENCES hub_vault_secrets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  timestamp TIMESTAMP DEFAULT now(),
  ip_address INET,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  message TEXT
);

-- hub_vault_rotation_policies table
CREATE TABLE IF NOT EXISTS hub_vault_rotation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID REFERENCES hub_vault_secrets(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  rotation_interval_days INTEGER DEFAULT 90,
  last_rotation TIMESTAMP,
  next_rotation TIMESTAMP,
  auto_rotate BOOLEAN DEFAULT false,
  notify_before_days INTEGER DEFAULT 7
);

-- hub_vault_expiration_alerts table
CREATE TABLE IF NOT EXISTS hub_vault_expiration_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID REFERENCES hub_vault_secrets(id) ON DELETE CASCADE UNIQUE,
  days_until_expiry INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  notified_at TIMESTAMP,
  dismissed_at TIMESTAMP
);

-- RLS Policies (sample)
ALTER TABLE hub_vault_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_secrets_access ON hub_vault_secrets FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

ALTER TABLE hub_vault_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_audit_access ON hub_vault_audit_log FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
`
