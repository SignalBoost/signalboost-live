export const conciergeCopy = {
  en: {
    label: 'AI Concierge',
    title: 'AI Concierge',
    default: "Hi, I'm your SignalBoost concierge.",
    thinking: 'Thinking...',
    videosBtn: '🎥 Videos',
    creditsBtn: '⚡ Credits',
    growthBtn: '📈 Growth',
    supportBtn: '💬 Support',
  },
}

export function getConciergeCopy(lang: string) {
  return conciergeCopy.en
}
