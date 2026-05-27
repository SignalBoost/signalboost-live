import OpenAI from 'openai'
import { NextResponse } from 'next/server'

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
  pl: 'Polish',
  ru: 'Russian',
}

type PromoteRequest = {
  businessName?: string
  promotion?: string
  audience?: string
  tone?: string
  lang?: string
  websiteUrl?: string
  pastedContext?: string
  attachmentText?: string
  attachmentName?: string
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

    let body: PromoteRequest = {}

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file')

      body = {
        businessName: String(formData.get('businessName') || ''),
        promotion: String(formData.get('promotion') || ''),
        audience: String(formData.get('audience') || ''),
        tone: String(formData.get('tone') || ''),
        lang: String(formData.get('lang') || 'en'),
        websiteUrl: String(formData.get('websiteUrl') || ''),
        pastedContext: String(formData.get('pastedContext') || ''),
      }

      if (file instanceof File) {
        body.attachmentName = file.name

        const safeTypes = [
          'text/plain',
          'text/csv',
          'application/json',
          'text/markdown',
        ]

        if (
          safeTypes.includes(file.type) ||
          file.name.endsWith('.txt')
        ) {
          body.attachmentText = await file.text()
        } else {
          body.attachmentText =
            `Attached file received: ${file.name}`
        }
      }
    } else {
      body = (await req.json()) as PromoteRequest
    }

    const businessName =
      body.businessName?.trim() || 'the business'

    const promotion =
      body.promotion?.trim() || ''

    const audience =
      body.audience?.trim() || 'local customers'

    const tone =
      body.tone?.trim() || 'friendly'

    const lang =
      body.lang?.trim() || 'en'

    const outputLanguage =
      LANGUAGE_NAMES[lang] || 'English'

    const websiteUrl =
      body.websiteUrl?.trim() || ''

    const pastedContext =
      body.pastedContext?.trim() || ''

    const attachmentText =
      body.attachmentText?.trim() || ''

    const attachmentName =
      body.attachmentName?.trim() || ''

    if (
      !promotion &&
      !pastedContext &&
      !attachmentText &&
      !websiteUrl
    ) {
      return NextResponse.json(
        {
          error:
            'Please enter, paste, attach, or provide a website URL.',
        },
        { status: 400 }
      )
    }

    const prompt = `
You are SignalBoost, a practical marketing helper for small businesses.

IMPORTANT LANGUAGE RULES:

The selected language is: ${outputLanguage}

You MUST generate ALL output ONLY in ${outputLanguage}

Never mix languages.

Business name: ${businessName}
Audience: ${audience}
Tone: ${tone}

Promotion:
${promotion || 'None'}

Website:
${websiteUrl || 'None'}

Additional context:
${pastedContext || 'None'}

Attachment:
${attachmentName || 'None'}

Attachment content:
${attachmentText || 'None'}

Return ONLY valid JSON:

{
"headline":"",
"website":{
"title":"",
"body":"",
"cta":""
},
"social":{
"facebook":"",
"instagram":"",
"tiktok":""
},
"email":{
"subject":"",
"body":""
},
"video":{
"hook":"",
"script":"",
"cta":""
},
"reviewFollowUp":"",
"languageIdeas":[]
}
`

    const completion =
      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.45,
        response_format: {
          type: 'json_object',
        },
        messages: [
          {
            role: 'system',
            content:
              `Always answer entirely in ${outputLanguage}. Return JSON only.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      })

    const raw =
      completion.choices[0]
        ?.message?.content || '{}'

    const campaign =
      JSON.parse(raw)

    return NextResponse.json({
      campaign,
    })

  } catch (error) {
    console.error(
      'Promote API error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Could not generate campaign.',
      },
      { status: 500 }
    )
  }
}
