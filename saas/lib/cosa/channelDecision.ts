export type CosaSignalSnapshot = {
  pendingApprovals?: number
  approvedOutreach?: number
  sentOutreach?: number
  sends24h?: number
  aiErrors24h?: number
  security24h?: number
  topNeeds?: string[]
}

export type CosaChannelRecommendation = {
  channel: 'youtube_video' | 'outreach' | 'social_post' | 'landing_page' | 'review_campaign'
  priority: 'low' | 'medium' | 'high'
  title: string
  reason: string
  approvalRequired: boolean
  suggestedAsset: {
    format: string
    length?: string
    objective: string
    draftBrief: string
  }
}

function hasNeed(snapshot: CosaSignalSnapshot, term: string) {
  return (snapshot.topNeeds || []).some(item => item.toLowerCase().includes(term.toLowerCase()))
}

export function decideCosaMarketingChannels(snapshot: CosaSignalSnapshot): CosaChannelRecommendation[] {
  const recommendations: CosaChannelRecommendation[] = []
  const pending = snapshot.pendingApprovals || 0
  const sent = snapshot.sentOutreach || 0
  const aiErrors = snapshot.aiErrors24h || 0
  const security = snapshot.security24h || 0

  if (pending > 5) {
    recommendations.push({
      channel: 'outreach',
      priority: 'high',
      title: 'Clear the human approval queue before creating new campaigns',
      reason: `There are ${pending} pending approval items. COSA should not create more outbound work until the owner approves or rejects the strongest items.`,
      approvalRequired: true,
      suggestedAsset: {
        format: 'Approval batch',
        objective: 'Move high-quality outreach through the guarded queue without manual data entry.',
        draftBrief: 'Rank pending outreach by urgency, fit, and expected value. Present the top five for approval.',
      },
    })
  }

  if (hasNeed(snapshot, 'video') || hasNeed(snapshot, 'content') || sent < 10) {
    recommendations.push({
      channel: 'youtube_video',
      priority: 'high',
      title: 'Create a YouTube explainer for SignalBoost COSA',
      reason: 'Video is the best next channel when the platform needs authority, demonstration, and reusable content for social media, outreach, and landing pages.',
      approvalRequired: true,
      suggestedAsset: {
        format: '5-minute YouTube video script',
        length: '4-6 minutes',
        objective: 'Explain that SignalBoost helps small businesses operate with AI departments where humans approve decisions instead of doing data entry.',
        draftBrief: 'Open with the problem: small businesses cannot afford full marketing and sales teams. Show COSA collecting intelligence, choosing the channel, drafting the campaign, and asking the owner to approve. Close with a call to try SignalBoost.',
      },
    })
  }

  if (sent >= 10 && pending <= 3) {
    recommendations.push({
      channel: 'social_post',
      priority: 'medium',
      title: 'Repurpose approved outreach into LinkedIn and short social posts',
      reason: 'Approved outreach gives COSA validated messaging. Repurposing it is cheaper than creating a new campaign from scratch.',
      approvalRequired: true,
      suggestedAsset: {
        format: 'LinkedIn + short-form social pack',
        objective: 'Turn validated sales language into public market education.',
        draftBrief: 'Create one founder-style LinkedIn post and three short captions about AI doing the work while humans approve.',
      },
    })
  }

  if (aiErrors > 0 || security > 10) {
    recommendations.push({
      channel: 'landing_page',
      priority: 'medium',
      title: 'Publish a trust-first AI governance page',
      reason: 'AI/security events suggest buyers may need reassurance about human approval, guardrails, send limits, and panic controls.',
      approvalRequired: true,
      suggestedAsset: {
        format: 'Trust landing page section',
        objective: 'Show that SignalBoost automates work without giving AI uncontrolled authority.',
        draftBrief: 'Explain low-risk automation, medium-risk approval, and high-risk owner authorization.',
      },
    })
  }

  if (!recommendations.length) {
    recommendations.push({
      channel: 'youtube_video',
      priority: 'medium',
      title: 'Create the weekly COSA progress video',
      reason: 'When no urgent signal dominates, COSA should build brand authority with consistent educational video content.',
      approvalRequired: true,
      suggestedAsset: {
        format: 'Weekly YouTube video script',
        length: '3-5 minutes',
        objective: 'Build credibility by documenting how SignalBoost uses COSA internally.',
        draftBrief: 'Tell the story of one weekly improvement: what COSA noticed, what it recommended, what the owner approved, and what changed.',
      },
    })
  }

  return recommendations
}
