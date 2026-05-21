import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
    if (!process.env.OPENAI_API_KEY) {
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

        if (safeTypes.includes(file.type) || file.name.endsWith('.txt')) {
          body.attachmentText = await file.text()
        } else {
          body.attachmentText =
            `Attached file received: ${file.name}. File text extraction is not enabled yet for this format.`
        }
      }
    } else {
      body = (await req.json()) as PromoteRequest
    }

    const businessName = body.businessName?.trim() || 'the business'
    const promotion = body.promotion?.trim() || ''
    const audience = body.audience?.trim() || 'local customers'
    const tone = body.tone?.trim() || 'friendly'
    const lang = body.lang?.trim() || 'en'
    const outputLanguage = LANGUAGE_NAMES[lang] || 'English'
    const websiteUrl = body.websiteUrl?.trim() || ''
    const pastedContext = body.pastedContext?.trim() || ''
    const attachmentText = body.attachmentText?.trim() || ''
    const attachmentName = body.attachmentName?.trim() || ''

    if (!promotion && !pastedContext && !attachmentText && !websiteUrl) {
      return NextResponse.json(
        { error: 'Please enter, paste, attach, or provide a website URL.' },
        { status: 400 }
      )
    }

    const prompt = `
You are SignalBoost, a practical marketing helper for small businesses.

IMPORTANT LANGUAGE RULES:

The selected language is: ${outputLanguage}

You MUST generate ALL output ONLY in ${outputLanguage}.

Absolutely forbidden:
- English words when the selected language is not English
- mixed languages
- translated leftovers
- headings in another language
- CTA buttons in another language

Every field in the JSON must be written entirely in ${outputLanguage}.

If the selected language is Portuguese, write natural Portuguese.
If the selected language is Spanish, write natural Spanish.
If the selected language is Polish, write natural Polish.
If the selected language is Russian, write natural Russian.
If the selected language is English, write natural English.

Do not explain these rules.
Do not mention AI.
Return valid JSON only.

Business name: ${businessName}
Audience: ${audience}
Tone: ${tone}
Selected language: ${outputLanguage}
Promotion request: ${promotion || 'No direct promotion text provided.'}
Website URL: ${websiteUrl || 'None provided.'}
Pasted business context: ${pastedContext || 'None provided.'}
Attachment name: ${attachmentName || 'None provided.'}
Attachment text/context: ${attachmentText || 'None provided.'}

Create a useful, realistic marketing campaign for a small business owner.

Return JSON with this exact shape:

{
  "headline": "short campaign headline",
  "website": {
    "title": "website banner title",
    "body": "website banner body",
    "cta": "button text"
  },
  "social": {
    "facebook": "Facebook post",
    "instagram": "Instagram caption",
    "tiktok": "TikTok caption"
  },
  "email": {
    "subject": "email subject",
    "body": "short email body"
  },
  "video": {
    "hook": "first 3 seconds",
    "script": "short video script",
    "cta": "video call to action"
  },
  "reviewFollowUp": "short message asking happy customers for a review",
  "languageIdeas": [
    "localized idea 1",
    "localized idea 2",
    "localized idea 3"
  ]
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You create marketing campaigns. You must answer only in ${outputLanguage}. Never mix languages. Return valid JSON only.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const campaign = JSON.parse(raw)

    return NextResponse.json({ campaign })
  } catch (error) {
    console.error('Promote API error:', error)

    return NextResponse.json(
      { error: 'Could not generate campaign.' },
      { status: 500 }
    )
  }
}
