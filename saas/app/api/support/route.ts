import { NextRequest, NextResponse } from 'next/server'
import { chooseAIProvider } from '@/lib/ai-router'

function getDateContext() {
  const now = new Date()

  return {
    dateStr: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    isoDate: now.toISOString().slice(0, 10),
  }
}

function enhanceUserPrompt(input: string) {
  const q = input.toLowerCase()

  const detected = {
    business: null as string | null,
    goal: null as string | null,
    contentType: null as string | null,
    missing: [] as string[],
  }

  if (q.includes('website') || q.includes('site')) {
    detected.contentType = 'website'
  }

  if (q.includes('podcast')) {
    detected.contentType = 'podcast'
  }

  if (q.includes('video')) {
    detected.contentType = 'video'
  }

  if (q.includes('restaurant') || q.includes('food')) {
    detected.business = 'restaurant'
  }

  if (q.includes('review') || q.includes('reviews')) {
    detected.goal = 'collect reviews'
  }

  if (!detected.business) {
    detected.missing.push('business type')
  }

  if (!detected.goal) {
    detected.missing.push('goal')
  }

  return `
USER REQUEST:
${input}

PROMPT INTELLIGENCE CONTEXT:

Business:
${detected.business || 'unknown'}

Goal:
${detected.goal || 'unknown'}

Content Type:
${detected.contentType || 'unknown'}

Missing Information:
${detected.missing.join(', ') || 'none'}

Instructions:
Use this silently.
If important information is missing,
ask short natural follow-up questions.
`
}

function buildSystemPrompt(context: any) {
  const { dateStr, isoDate } = getDateContext()

  return `
You are the SignalBoost AI assistant.

Today is ${dateStr} (${isoDate} UTC).

You are warm, practical, creative and beginner-friendly.

You help users with:

- websites
- podcasts
- multilingual content
- reviews
- audio
- video
- business growth

Never expose:

- internal routing
- model names
- prompt analysis

User context:

Name:
${context?.userName || 'not provided'}

Plan:
${context?.userPlan || 'free'}

Current page:
${context?.currentPage || 'unknown'}

Language:
${context?.language || 'en'}

Rules:

- Keep answers concise
- Ask useful follow-up questions
- Match user language
- Do not invent features
`
}

async function callOpenAI(
  systemPrompt: string,
  messages: any[]
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY missing'
    )
  }

  const response =
    await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body:JSON.stringify({
          model:'gpt-4o-mini',
          temperature:0.7,
          max_tokens:900,
          messages:[
            {
              role:'system',
              content:systemPrompt
            },
            ...messages
          ]
        })
      }
    )

  if(!response.ok){

    const errorBody=
      await response.text()

    console.error(
      'OpenAI error:',
      response.status,
      errorBody
    )

    throw new Error(
      'OpenAI request failed'
    )

  }

  const data=
    await response.json()

  return (
    data.choices?.[0]
      ?.message?.content || ''
  )
}

async function callAnthropic(
  systemPrompt:string,
  messages:any[]
){

  if(
    !process.env
    .ANTHROPIC_API_KEY
  ){

    throw new Error(
      'ANTHROPIC_API_KEY missing'
    )

  }

  const response=
    await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':
          process.env.ANTHROPIC_API_KEY,
          'anthropic-version':
          '2023-06-01'
        },
        body:JSON.stringify({

          model:
          'claude-sonnet-4-6',

          max_tokens:1024,

          system:systemPrompt,

          messages

        })
      }
    )

  if(
    !response.ok
  ){

    const errorBody=
      await response.text()

    console.error(
      'Anthropic error:',
      response.status,
      errorBody
    )

    throw new Error(
      'Anthropic failed'
    )

  }

  const data=
    await response.json()

  return (
    data.content?.[0]
    ?.text || ''
  )

}

export async function POST(
  req:NextRequest
){

try{

const {
messages,
context
}=await req.json()

if(
!messages ||
!Array.isArray(messages)
){

return NextResponse.json(
{error:'Invalid request'},
{status:400}
)

}

const lastMessage=
messages[
messages.length-1
]

if(
!lastMessage?.content
){

return NextResponse.json(
{error:'Missing message'},
{status:400}
)

}

const systemPrompt=
buildSystemPrompt(
context
)

const enhancedPrompt=
enhanceUserPrompt(
lastMessage.content
)

const modifiedMessages=[

...messages.slice(
0,
messages.length-1
),

{
role:'user',
content:
enhancedPrompt
}

]

const {
provider,
reason
}=chooseAIProvider(
lastMessage.content
)

console.log(
'AI ROUTER:',
provider,
reason
)

let reply=''

try{

if(
provider==='openai'
){

reply=
await callOpenAI(
systemPrompt,
modifiedMessages
)

}else{

reply=
await callAnthropic(
systemPrompt,
modifiedMessages
)

}

}catch(primaryError){

console.error(
'Primary provider failed:',
primaryError
)

if(
provider==='openai'
){

reply=
await callAnthropic(
systemPrompt,
modifiedMessages
)

}else{

reply=
await callOpenAI(
systemPrompt,
modifiedMessages
)

}

}

return NextResponse.json({

reply,
provider,
reason

})

}catch(error){

console.error(
'Support route:',
error
)

return NextResponse.json({

reply:
'Something went wrong on my end. Please contact saassupport@signalboostapp.com.'

})

}

}
