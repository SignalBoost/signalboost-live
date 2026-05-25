// File: lib/ai-router.ts

export type AIProvider =
  | 'openai'
  | 'anthropic'

export interface RouteResult {
  provider: AIProvider
  reason: string
}

export function chooseAIProvider(
  userInput: string
): RouteResult {

  const q = (userInput || '')
    .toLowerCase()

  /*
   Creative / generation-heavy work
   → GPT
  */

  if (
    q.includes('website') ||
    q.includes('marketing') ||
    q.includes('podcast') ||
    q.includes('video') ||
    q.includes('brand') ||
    q.includes('social') ||
    q.includes('content')
  ) {

    return {
      provider:'openai',
      reason:'creative_generation'
    }

  }

  /*
   Longer explanations /
   support conversations
   → Claude
  */

  if (

    q.includes('help') ||
    q.includes('problem') ||
    q.includes('issue') ||
    q.includes('error') ||
    q.includes('how') ||
    q.includes('why')

  ){

    return{
      provider:'anthropic',
      reason:'reasoning_support'
    }

  }

  /*
   default
  */

  return{

    provider:'anthropic',
    reason:'default'

  }

}
