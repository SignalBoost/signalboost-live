import OpenAI from 'openai'
import { NextResponse } from 'next/server'

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

type PodcastLaunchpadRequest = {
  topic?: string
  format?: string
  experience?: string
}

export async function POST(req: Request) {
  try {
    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured.' },
        { status: 500 }
      )
    }

    const body = (await req.json()) as PodcastLaunchpadRequest

    const topic = body.topic?.trim() || ''
    const format = body.format?.trim() || 'solo'
    const experience = body.experience?.trim() || 'guided'

    if (!topic) {
      return NextResponse.json(
        { error: 'Please describe your podcast idea.' },
        { status: 400 }
      )
    }

    const styleInstruction =
      experience === 'power'
        ? 'Use concise but more strategic language. You may include production and publishing terms.'
        : experience === 'assisted'
          ? 'Use clear language with some helpful explanation.'
          : 'Use very simple beginner-friendly language. Avoid jargon. Be direct and step-by-step.'

    const prompt = `
You are SignalBoost Podcast Launchpad.

Help a user start a podcast.

User podcast idea:
${topic}

Podcast format:
${format}

User guidance level:
${experience}

Communication rule:
${styleInstruction}

Return ONLY valid JSON with this exact shape:

{
  "showNames": [
    "name idea 1",
    "name idea 2",
    "name idea 3",
    "name idea 4",
    "name idea 5"
  ],
  "showDescription": "short description of the podcast",
  "targetAudience": "who this podcast is for",
  "firstEpisodes": [
    "episode idea 1",
    "episode idea 2",
    "episode idea 3",
    "episode idea 4",
    "episode idea 5"
  ],
  "introScript": "short spoken intro script",
  "launchChecklist": [
    "step 1",
    "step 2",
    "step 3",
    "step 4",
    "step 5"
  ],
  "nextStep": "one clear next action"
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You help beginners start podcasts. Be direct, useful, and return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const sketch = JSON.parse(raw)

    return NextResponse.json({ sketch })
  } catch (error) {
    console.error('Podcast Launchpad API error:', error)

    return NextResponse.json(
      { error: 'Could not generate podcast sketch.' },
      { status: 500 }
    )
  }
}
