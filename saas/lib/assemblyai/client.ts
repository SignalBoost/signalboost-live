// saas/lib/assemblyai/client.ts
// AssemblyAI client — upload audio/video, transcribe, poll for result.
// Mirrors the pattern of lib/elevenlabs/client.ts.

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2'

function headers() {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) throw new Error('ASSEMBLYAI_API_KEY is not set')
  return {
    authorization: key,
    'content-type': 'application/json',
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type TranscriptWord = {
  text: string
  start: number  // ms
  end: number    // ms
  confidence: number
}

export type TranscriptChapter = {
  gist: string
  headline: string
  summary: string
  start: number
  end: number
}

export type TranscriptResult = {
  id: string
  status: 'completed' | 'error'
  text: string
  words: TranscriptWord[]
  chapters: TranscriptChapter[] | null
  audio_duration: number  // seconds
  language_code: string
  error?: string
}

// ── Step 1: Upload file buffer to AssemblyAI CDN ─────────────────────────────

export async function uploadAudio(buffer: ArrayBuffer): Promise<string> {
  const res = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: 'POST',
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY!,
      'content-type': 'application/octet-stream',
      'transfer-encoding': 'chunked',
    },
    body: buffer,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AssemblyAI upload failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.upload_url as string
}

// ── Step 2: Start transcription job ──────────────────────────────────────────

export async function startTranscription(audioUrl: string, languageCode = 'en'): Promise<string> {
  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: languageCode,
      word_boost: [],
      punctuate: true,
      format_text: true,
      speaker_labels: true,
      auto_chapters: true,
      // Word-level timestamps — essential for caption generation
      words_per_caption_group: 8,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AssemblyAI transcription start failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.id as string
}

// ── Step 3: Poll until done (max ~10 min) ────────────────────────────────────

export async function pollTranscription(transcriptId: string): Promise<TranscriptResult> {
  const maxAttempts = 120  // 120 × 5s = 10 minutes max
  let attempts = 0

  while (attempts < maxAttempts) {
    await sleep(5000)
    attempts++

    const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY!,
      },
    })

    if (!res.ok) {
      throw new Error(`AssemblyAI poll failed: ${res.status}`)
    }

    const data = await res.json()

    if (data.status === 'completed') {
      return {
        id: data.id,
        status: 'completed',
        text: data.text ?? '',
        words: data.words ?? [],
        chapters: data.chapters ?? null,
        audio_duration: data.audio_duration ?? 0,
        language_code: data.language_code ?? 'en',
      }
    }

    if (data.status === 'error') {
      return {
        id: data.id,
        status: 'error',
        text: '',
        words: [],
        chapters: null,
        audio_duration: 0,
        language_code: 'en',
        error: data.error ?? 'Unknown transcription error',
      }
    }

    // status === 'processing' | 'queued' — keep polling
  }

  throw new Error('AssemblyAI transcription timed out after 10 minutes')
}

// ── Caption generation from word timestamps ───────────────────────────────────

export type CaptionEntry = {
  index: number
  start: string   // HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT)
  end: string
  text: string
}

// Groups words into caption lines (max N words or max duration ms)
export function wordsToCaption(
  words: TranscriptWord[],
  format: 'srt' | 'vtt' | 'ass' = 'srt',
  wordsPerLine = 8,
  maxLineDurationMs = 5000,
): CaptionEntry[] {
  if (!words.length) return []

  const entries: CaptionEntry[] = []
  let group: TranscriptWord[] = []
  let groupStart = words[0].start

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    group.push(word)

    const duration = word.end - groupStart
    const isLast = i === words.length - 1
    const flush = group.length >= wordsPerLine || duration >= maxLineDurationMs || isLast

    if (flush && group.length > 0) {
      entries.push({
        index: entries.length + 1,
        start: formatTimestamp(groupStart, format),
        end: formatTimestamp(word.end, format),
        text: group.map(w => w.text).join(' '),
      })
      group = []
      if (!isLast) groupStart = words[i + 1].start
    }
  }

  return entries
}

export function captionEntriesToSRT(entries: CaptionEntry[]): string {
  return entries.map(e =>
    `${e.index}\n${e.start} --> ${e.end}\n${e.text}\n`
  ).join('\n')
}

export function captionEntriesToVTT(entries: CaptionEntry[]): string {
  const lines = ['WEBVTT', '']
  entries.forEach(e => {
    lines.push(`${e.index}`)
    lines.push(`${e.start} --> ${e.end}`)
    lines.push(e.text)
    lines.push('')
  })
  return lines.join('\n')
}

export function captionEntriesToASS(entries: CaptionEntry[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const events = entries.map(e =>
    `Dialogue: 0,${e.start},${e.end},Default,,0,0,0,,${e.text}`
  ).join('\n')

  return header + events
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatTimestamp(ms: number, format: 'srt' | 'vtt' | 'ass'): string {
  const totalSeconds = Math.floor(ms / 1000)
  const millis = ms % 1000
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  const ms3 = String(millis).padStart(3, '0')

  if (format === 'srt') return `${hh}:${mm}:${ss},${ms3}`
  if (format === 'vtt') return `${hh}:${mm}:${ss}.${ms3}`
  // ASS format: H:MM:SS.cc (centiseconds)
  const cs = String(Math.floor(millis / 10)).padStart(2, '0')
  return `${h}:${mm}:${ss}.${cs}`
}
