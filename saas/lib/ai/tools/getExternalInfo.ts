// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOL_GET_PRICING: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getPricing',
    description: 'Get the current, live SignalBoost SaaS pricing and plan details (Free Demo, Launch, Growth, Command). Call this whenever the user asks about price, cost, plans, tiers, what a plan includes, or upgrades.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_BUSINESS_METRICS: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getBusinessMetrics',
    description: 'Refresh live business metrics from Supabase: users, MRR, plan breakdown, outreach leads, credit balances. Metrics are pre-loaded at session start — call this only if the owner asks for a refresh or asks about something that may have changed during the conversation.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_EXTERNAL_INFO: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getExternalInfo',
    description: 'Perform a live web search for current external information: market data, competitor analysis, industry trends, news, regulations, prices of external services. Returns top results with titles, URLs, and snippets. Use for anything outside SignalBoost internal data that requires up-to-date facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The web search query, e.g. "AI website builder market size 2026" or "Canva pricing plans".' },
      },
      required: ['query'],
    },
  },
}

const CONCIERGE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  TOOL_GET_PRICING,
]

const CHIEF_OF_STAFF_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_BUSINESS_METRICS,
  TOOL_GET_EXTERNAL_INFO,
]

async function runTool(name: string, rawArgs: string): Promise<string> {
  if (name === 'getPricing') {
    const result = await getLivePricing()
    if (!result.ok || !result.pricing) {
      return 'Live pricing could not be retrieved right now. Tell the user you could not load current pricing and suggest they check the Pricing page directly.'
    }
    return `Current live SignalBoost SaaS pricing (source: ${result.source}):\n\n${result.pricing}`
  }

  if (name === 'getBusinessMetrics') {
    const result = await getBusinessMetrics()
    if (result.ok && result.metrics) {
      return formatMetricsForAI(result.metrics)
    }
    return `Business metrics could not be retrieved: ${result.error ?? 'unknown error'}. Let the owner know and suggest checking Supabase directly.`
  }

  if (name === 'getExternalInfo') {
    let query = ''
    try { query = String(JSON.parse(rawArgs || '{}')?.query || '') } catch {}
    if (!query.trim()) {
      return 'No search query was provided. Ask the owner what they want to search for.'
    }
    const result = await getExternalInfo(query)
    if (result.ok && result.results.length) {
      return formatExternalInfoForAI(query, result.results)
    }
    return `Web search failed: ${result.error ?? 'unknown error'}. Tell the owner live external data is unavailable right now and answer from your own knowledge, clearly flagging that it may be outdated.`
  }

  return `Unknown tool: ${name}`
}

export async function POST(req: NextRequest) {
  try {
    const body         = await req.json()
    const messages     = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
    const languageCode = String(body?.context?.language || 'en').toLowerCase()
    const language     = LANGUAGE_LABELS[languageCode] || 'English'
    const currentPage  = String(body?.context?.currentPage || '/')

    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    let isPrivileged = false
    try {
      const access = await getAccess()
      isPrivileged = access.isAdmin
    } catch {
      isPrivileged = false
    }

    if (!sanitized.length) {
      const local = getConciergeAnswer('', languageCode, currentPage)
      return NextResponse.json({ reply: local.reply, telemetry: local })
    }

    const latestUserMessage = [...sanitized].reverse().find(m => m.role === 'user')?.content || ''
    const local = getConciergeAnswer(latestUserMessage, languageCode, currentPage)

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: local.reply, telemetry: local, source: 'deterministic-concierge' })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'AI backend is not configured.' }, { status: 500 })
    }

    const model       = isPrivileged ? 'gpt-4o' : 'gpt-4o-mini'
    const temperature = isPrivileged ? 0.5 : 0.4
    const tools       = isPrivileged ? CHIEF_OF_STAFF_TOOLS : CONCIERGE_TOOLS

    // ── Pre-fetch live metrics for Chief of Staff on every request ────────
    let liveMetrics = 'Metrics unavailable — Supabase query failed.'
    if (isPrivileged) {
      try {
        const metricsResult = await getBusinessMetrics()
        if (metricsResult.ok && metricsResult.metrics) {
          liveMetrics = formatMetricsForAI(metricsResult.metrics)
        }
      } catch {
        // non-blocking — fallback text already set
      }
    }

    const systemContent = isPrivileged
      ? chiefOfStaffPrompt(language, liveMetrics)
      : conciergePrompt(language)

    const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...sanitized,
    ]

    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI request timeout')), 25000)),
      ])

    let response = await withTimeout(
      openai.chat.completions.create({
        model,
        temperature,
        messages: convo,
        tools,
        tool_choice: 'auto',
      })
    )

    let choice     = response.choices[0]
    let toolRounds = 0

    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && toolRounds < 3) {
      toolRounds++

      convo.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam)

      for (const call of choice.message.tool_calls) {
        const toolName = call.function?.name || ''
        const toolArgs = call.function?.arguments || '{}'
        const result   = await runTool(toolName, toolArgs)
        convo.push({
          role:         'tool',
          tool_call_id: call.id,
          content:      result,
        })
      }

      response = await withTimeout(
        openai.chat.completions.create({
          model,
          temperature,
          messages: convo,
          tools,
          tool_choice: 'auto',
        })
      )
      choice = response.choices[0]
    }

    const reply = choice?.message?.content?.trim()
    if (!reply) {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }

    return NextResponse.json({
      reply,
      telemetry: local,
      source: isPrivileged ? 'openai-chief' : 'openai-concierge',
    })
  } catch (error) {
    console.error('Support API error', error)
    return NextResponse.json({ error: 'Could not process your request right now.' }, { status: 500 })
  }
}
