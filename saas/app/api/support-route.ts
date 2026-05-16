import { NextRequest, NextResponse } from 'next/server'

const SIGNALBOOST_KNOWLEDGE = `
You are the SignalBoost AI support agent. You are helpful, friendly, solution-focused and concise.
You work for SignalBoost — a multilingual content platform that helps businesses build websites, collect reviews, produce native audio and video content in 5 languages: English, Portuguese, Spanish, Polish and Russian.

CRITICAL RULES:
- You already have full context about the user — never ask them to explain their situation from scratch
- Never say "I cannot help with that" without offering an alternative path
- If you try twice and cannot resolve — say "I am bringing in additional AI support to help solve this"
- Then escalate by adding [ESCALATE] at the end of your message
- Always be solution-focused — no dead ends ever
- Respond in the same language the user writes in
- Keep responses concise and actionable — no long paragraphs

SIGNALBOOST SERVICES:
- Site builder: Create multilingual websites
- Review collector: Collect and display customer reviews in multiple languages
- Native audio: AI voiceover in 5 languages (not subtitles — real native voices via ElevenLabs)
- Video editor: Create and export videos with multilingual captions (SRT, VTT formats)
- Podcast support: Upload finished episodes, generates voiceover, captions, social clips, show notes
- Social clips: Auto-generate TikTok, Reels, YouTube Shorts clips

PLANS:
- Free: 3 projects, 1 language, 100MB storage, 1 user
- Starter ($10/mo): 10 projects, 2 languages, 1GB, 1 user, 50 audio credits/mo
- Pro ($30/mo): 30 projects, all 5 languages, 10GB, 3 users, 200 audio credits/mo, video editor
- Business ($90/mo): Unlimited projects, all 5 languages, 50GB, 10 users, unlimited audio
- Podcast Indie ($29/mo): 1 show, 4 episodes/mo, 2 languages, captions, clips, website
- Podcast Pro ($79/mo): 3 shows, unlimited episodes, all 5 languages
- Podcast Network ($299/mo): Unlimited shows, white label, API access
- Business partners: 30 days free on Starter plan
- All paid plans: 30 day free trial

WHAT SIGNALBOOST DOES NOT DO:
- Hardware or recording equipment
- Raw audio editing
- Podcast hosting or RSS feeds
- Music production

ESCALATION:
- For billing issues: escalate to Luis at cadomos@gmail.com
- For platform bugs: escalate to Luis
- When stuck after 2 attempts: add [ESCALATE] to response
- Luis will be notified with full conversation context automatically
`

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Build rich system prompt with user context
    const contextStr = context ? `
CURRENT USER CONTEXT (do not ask user to repeat this):
- Name: ${context.userName || 'Unknown'}
- Email: ${context.userEmail || 'Unknown'}
- Plan: ${context.userPlan || 'free'}
- Current page: ${context.currentPage || 'Unknown'}
- Time on page: ${Math.floor((context.timeOnPageSeconds || 0) / 60)} minutes ${(context.timeOnPageSeconds || 0) % 60} seconds
- Click count: ${context.clickCount || 0}
- Errors detected: ${context.errorCount || 0}
- Last error: ${context.lastError || 'none'}

Use this context to proactively help. If the user has been on the page a long time or had errors, acknowledge this and offer targeted help.
` : ''

    const systemPrompt = SIGNALBOOST_KNOWLEDGE + contextStr

    // First try with SignalBoost knowledge
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      return NextResponse.json({
        reply: 'I am having trouble connecting. Please email cadomos@gmail.com and Luis will help you personally.'
      })
    }

    const data = await response.json()
    let reply = data.content?.[0]?.text || ''

    // If escalation needed — call Claude again with broader context
    if (reply.includes('[ESCALATE]')) {
      reply = reply.replace('[ESCALATE]', '').trim()

      // Second call with broader reasoning
      const escalationResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: `You are an expert technical support AI helping a SignalBoost support agent resolve a user issue.
The support agent could not solve the problem. Here is all the context:
${contextStr}
The conversation so far: ${JSON.stringify(messages)}
The agent's last attempt: ${reply}

Your job: analyze everything and provide the most likely solution. Be specific and actionable.
If this is a billing or account issue that genuinely needs human intervention, say so clearly and provide cadomos@gmail.com as the contact.`,
          messages: [{ role: 'user', content: 'Please analyze this situation and provide the best solution.' }],
        }),
      })

      if (escalationResponse.ok) {
        const escalationData = await escalationResponse.json()
        const escalationReply = escalationData.content?.[0]?.text || ''

        // Combine both responses seamlessly
        reply = `I brought in additional AI support to help with this. Here is what we found:\n\n${escalationReply}`
      }
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Support route error:', error)
    return NextResponse.json({
      reply: 'I am having trouble right now. Please email cadomos@gmail.com and Luis will help you personally.'
    })
  }
}
