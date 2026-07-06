export const FALLBACK_VOICEOVER_MS = 30000

export function isVoiceQuotaError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase()
  return message.includes('quota') || message.includes('credit') || message.includes('billing') || message.includes('payment') || message.includes('elevenlabs error 402') || message.includes('elevenlabs error 429')
}

export function silentWavDataUri(durationMs = FALLBACK_VOICEOVER_MS): string {
  const sampleRate = 16000
  const channels = 1
  const bitsPerSample = 16
  const samples = Math.max(1, Math.round((durationMs / 1000) * sampleRate))
  const dataSize = samples * channels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28)
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return `data:audio/wav;base64,${buffer.toString('base64')}`
}
