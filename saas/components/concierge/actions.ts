export async function getCreditSummary() {
  try {
    const response = await fetch('/api/credits')
    const data = await response.json()

    return `⚡ ${data.credits} credits · ${data.plan} plan`
  } catch {
    return '⚡ Unable to load credits.'
  }
}

export async function getSupportReply({
  lang,
  pathname,
  prompt,
}: {
  lang: string
  pathname: string | null
  prompt: string
}) {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        context: {
          language: lang,
          currentPage: pathname,
        },
      }),
    })

    const data = await response.json()

    return data.reply || '💬 Unable to connect.'
  } catch {
    return '💬 Unable to connect.'
  }
}
