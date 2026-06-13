// saas/lib/auth/totp-service.ts
// TOTP (Time-based One-Time Password) for 2FA using speakeasy + qrcode

import speakeasy from 'speakeasy'
import QRCode from 'qrcode'

/**
 * Generate new TOTP secret for user
 */
export function generateTOTPSecret(userEmail: string) {
  const secret = speakeasy.generateSecret({
    name: `SignalBoost Vault (${userEmail})`,
    issuer: 'SignalBoost',
    length: 32, // Longer secret = more secure
  })

  return {
    secret: secret.base32, // Store this in Supabase (encrypted)
    backupCodes: generateBackupCodes(), // Show user once
  }
}

/**
 * Generate QR code as data URL
 */
export async function generateQRCode(secret: string): Promise<string> {
  try {
    const qrCode = await QRCode.toDataURL(secret, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
    return qrCode
  } catch (err) {
    throw new Error(`Failed to generate QR code: ${err instanceof Error ? err.message : String(err)}`)
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
      token: token.replace(/\s/g, ''), // Remove spaces
      window, // Allow codes from ±2 time windows (±60 seconds)
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
