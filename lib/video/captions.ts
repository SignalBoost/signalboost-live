import type { CaptionCue } from '@/lib/video/types'

function parseTimestamp(value: string) {
  const normalized = value.trim().replace(',', '.')
  const parts = normalized.split(':')
  if (parts.length !== 3) return 0
  const [hours, minutes, seconds] = parts
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds)
}

function normalizeText(lines: string[]) {
  return lines.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export function parseCaptionText(input: string): CaptionCue[] {
  const blocks = input
    .replace(/^WEBVTT[^\n]*(?:\r?\n(?:NOTE[^\n]*\r?\n)?)?(?:\r?\n)/, '')
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0)

  const cues: CaptionCue[] = []
  for (const block of blocks) {
    const timingIndex = block.findIndex((line) => line.includes('-->'))
    if (timingIndex === -1) continue
    const [startRaw, endRaw] = block[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0])
    const text = normalizeText(block.slice(timingIndex + 1))
    if (!text) continue
    cues.push({
      id: `cue-${cues.length + 1}`,
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw),
      text,
    })
  }
  return cues
}

export function captionsToAssDialogue(cues: CaptionCue[]) {
  return cues.map((cue) => ({
    start: cue.start,
    end: Math.max(cue.end, cue.start + 0.5),
    text: cue.text.replace(/[{}]/g, '').replace(/\n/g, ' '),
  }))
}
