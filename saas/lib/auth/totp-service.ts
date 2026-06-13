// saas/lib/auth/totp-service.ts
// TOTP (Time-based One-Time Password) for 2FA using speakeasy

import speakeasy from 'speakeasy'

/**
 * Generate new TOTP secret for user
 */
export function generateTOTPSecret(userEmail: string) {
  const secret = speakeasy.generateSecret({
    name: `SignalBoost Vault (${userEmail})`,
    issuer: 'SignalBoost',
    length: 32,
  })

  return {
    secret: secret.base32,
    backupCodes: generateBackupCodes(),
  }
}

/**
 * Verify TOTP code
 */
export function verifyTOTPCode(secret: string, token: string, window = 2): boolean {
  try {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: token.replace(/\s/g, ''),
      window,
    })
  } catch (err) {
    return false
  }
}

/**
 * Generate backup codes (10 codes for account recovery)
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase()
    codes.push(code)
  }
  return codes
}

/**
 * Verify backup code (one-time use)
 */
export function verifyBackupCode(code: string, storedCodes: string[]): boolean {
  return storedCodes.includes(code.toUpperCase())
}
