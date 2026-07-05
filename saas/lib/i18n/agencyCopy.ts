export type AgencyPlan = {
  name: string
  price: string
  fee: string
  features: string[]
}

export type AgencyCopy = {
  hero: {
    eyebrow: string
    title: string
    body: string
    primaryCta: string
    secondaryCta: string
  }
  client: {
    title: string
    body: string
    budgetLabel: string
    submit: string
    ready: string
    error: string
    summaryTitle: string
    selectedBudget: string
    processingFee: string
    totalCharged: string
  }
  pricing: {
    eyebrow: string
    title: string
    plans: AgencyPlan[]
  }
  notes: {
    complianceTitle: string
    complianceBody: string
    enterpriseTitle: string
    enterpriseBody: string
  }
}

export const agencyCopy: Record<string, AgencyCopy> = {
  en: {
    hero: {
      eyebrow: 'Public agency engine',
      title: 'Plan public-sector campaigns without dispatching live media.',
      body: 'Model a compliant budget, review channels, and prepare an operator-ready package before any broker, press, radio, TV, social, or ad exchange action happens.',
      primaryCta: 'Estimate campaign budget',
      secondaryCta: 'Review pricing',
    },
    client: {
      title: 'Budget checkout preview',
      body: 'Enter a proposed media budget. SignalBoost recalculates the processing fee on the server and returns a checkout-ready preview only.',
      budgetLabel: 'Selected budget in USD',
      submit: 'Prepare checkout preview',
      ready: 'Checkout preview ready. No payment provider has been called.',
      error: 'Enter a budget greater than zero.',
      summaryTitle: 'Server-calculated summary',
      selectedBudget: 'Selected budget',
      processingFee: 'Processing fee',
      totalCharged: 'Total charged',
    },
    pricing: {
      eyebrow: 'Pricing',
      title: 'Transparent campaign setup for agency teams.',
      plans: [
        { name: 'Public Launch', price: 'Bring your budget', fee: '15% processing fee', features: ['Server-side budget recalculation', 'Checkout-ready preview without Stripe', 'Compliance notes before activation'] },
        { name: 'Agency Operations', price: 'Custom scope', fee: 'Human approval required', features: ['Channel plan packaging', 'Operator review before dispatch', 'No live broker or ad exchange calls'] },
        { name: 'Enterprise Fallback', price: 'Contact SignalBoost', fee: 'White-glove support', features: ['Procurement-friendly review', 'Human escalation path', 'Custom safety and compliance workflow'] },
      ],
    },
    notes: {
      complianceTitle: 'Compliance and safety note',
      complianceBody: 'This page is a planning surface only. It does not call Stripe, dispatch brokers, or connect to LinkedIn, YouTube, press, radio, TV, or ad exchange APIs.',
      enterpriseTitle: 'Human fallback for enterprise teams',
      enterpriseBody: 'Large public campaigns should move through a human SignalBoost operator for procurement review, approval gates, and launch coordination before any live activation.',
    },
  },
}

export function getAgencyCopy(lang?: string): AgencyCopy {
  return agencyCopy[lang || 'en'] || agencyCopy.en
}
