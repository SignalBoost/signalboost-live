#!/usr/bin/env node

// Production entrypoint for COSA video rendering.
// Never start the renderer unless the natural narration provider is configured
// and reachable. The worker's legacy eSpeak fallback is intentionally blocked
// here so robotic audio can never be marked "ready to approve".

const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim()
const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim()

if (!apiKey) {
  throw new Error(
    'Natural narration is required. ELEVENLABS_API_KEY is missing from GitHub Actions secrets. Render stopped; robotic fallback is not allowed.',
  )
}

async function assertNaturalVoiceAvailable() {
  const userResponse = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!userResponse.ok) {
    const detail = await userResponse.text().catch(() => '')
    throw new Error(
      `Natural narration account check failed (HTTP ${userResponse.status}). Render stopped; robotic fallback is not allowed. ${detail.slice(0, 240)}`,
    )
  }

  const voiceResponse = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!voiceResponse.ok) {
    const detail = await voiceResponse.text().catch(() => '')
    throw new Error(
      `Configured ElevenLabs voice ${voiceId} is unavailable (HTTP ${voiceResponse.status}). Render stopped; robotic fallback is not allowed. ${detail.slice(0, 240)}`,
    )
  }
}

await assertNaturalVoiceAvailable()
console.log(`Natural narration preflight passed for voice ${voiceId}.`)
await import('./cos-video-production-worker.mjs')
