// saas/lib/auth/totp-service.ts
// TOTP (Time-based One-Time Password) using Node.js built-in crypto

import { createHmac, randomInt } from 'crypto'

/**
 * Generate TOTP secret (base32 encoded random bytes)
 */
export function generateTOTPSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let secret = ''
  for (let i = 0; i < 32; i++) {
    secret += chars[randomInt(chars.length)]
  }
  return secret
}

/**
 * Decode base32 string to buffer
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of input.toUpperCase()) {
    const index = alphabet.indexOf(char)
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`)

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 0xff)
    }
  }

  return Buffer.from(bytes)
}

/**
 * Verify TOTP code
 */
export function verifyTOTPCode(secret: string, token: string, window = 2): boolean {
  try {
    const cleanToken = token.replace(/\s/g, '')
    if (cleanToken.length !== 6 || !/^\d+$/.test(cleanToken)) {
      return false
    }

    const secretBuffer = base32Decode(secret)
    const now = Math.floor(Date.now() / 1000)

    // Check current and adjacent time windows
    for (let i = -window; i <= window; i++) {
      const timeCounter = Math.floor((now + i * 30) / 30)
      const code = generateTOTPCode(secretBuffer, timeCounter)

      if (code === cleanToken) {
        return true
      }
    }

    return false
  } catch (err) {
    console.error('TOTP verification error:', err)
    return false
  }
}

/**
 * Generate TOTP code for a given time counter
 */
function generateTOTPCode(secret: Buffer, timeCounter: number): string {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(timeCounter), 0)

  const hmac = createHmac('sha1', secret)
  hmac.update(counterBuffer)
  const hash = hmac.digest()

  const offset = hash[hash.length - 1] & 0x0f
  const code = hash.readUInt32BE(offset) & 0x7fffffff

  return String(code % 1000000).padStart(6, '0')
}

/**
 * Generate backup codes (10 codes for account recovery)
 */
export function generateBackupCodes(count = 10): string[] {
  const alphabet = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    let code = ''
    for (let j = 0; j < 8; j++) code += alphabet[randomInt(alphabet.length)]
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
