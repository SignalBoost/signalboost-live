#!/usr/bin/env node

// Production entrypoint for COSA base-video rendering.
//
// Base rendering is Step 1 of the pipeline and must remain independent from
// narration. Natural voice and captions are added later by the dedicated
// campaign voice stage. A missing, expired, rate-limited, or temporarily
// unavailable ElevenLabs account must therefore never leave base render jobs
// stuck in the queue.

console.log('Starting COSA base-video production worker. Voice provider checks run in the later voice stage.')
await import('./cos-video-production-worker.mjs')
