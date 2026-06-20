/**
 * saas/lib/audit/pricingConfig.ts
 * Self-contained audit pricing configuration.
 * Zero imports from platform plan types or external modules.
 */

export interface AuditCount {
  value: number;
  unlimited: boolean;
  label: string;
}

export interface AuditTier {
  id: string;
  name: string;
  price: number;
  billingPeriod: string;
  auditsPerMonth: AuditCount;
  features: string[];
  ctaLabel: string;
  isPopular: boolean;
  isEnterprise: boolean;
  stripePriceId: string | null;
}

export interface AuditPricingConfig {
  tiers: AuditTier[];
  currency: string;
  currencySymbol: string;
}

export const AUDIT_PRICING_CONFIG: AuditPricingConfig = {
  currency: 'USD',
  currencySymbol: '$',
  tiers: [
    {
      id: 'audit-starter',
      name: 'Starter',
      price: 29,
      billingPeriod: 'month',
      auditsPerMonth: {
        value: 3,
        unlimited: false,
        label: '3 audits / mo',
      },
      features: [
        'AI-powered site audit',
        'SEO gap analysis',
        'Performance score',
        'PDF export',
        'Email support',
      ],
      ctaLabel: 'Get Started',
      isPopular: false,
      isEnterprise: false,
      stripePriceId: null,
    },
    {
      id: 'audit-growth',
      name: 'Growth',
      price: 79,
      billingPeriod: 'month',
      auditsPerMonth: {
        value: 20,
        unlimited: false,
        label: '20 audits / mo',
      },
      features: [
        'Everything in Starter',
        'Competitor benchmarking',
        'Branded PDF reports',
        'Priority support',
        'API access',
      ],
      ctaLabel: 'Start Growing',
      isPopular: true,
      isEnterprise: false,
      stripePriceId: null,
    },
    {
      id: 'audit-pro',
      name: 'Pro',
      price: 199,
      billingPeriod: 'month',
      auditsPerMonth: {
        value: 100,
        unlimited: false,
        label: '100 audits / mo',
      },
      features: [
        'Everything in Growth',
        'White-label reports',
        'Team seats (up to 5)',
        'Webhook integrations',
        'Dedicated account manager',
      ],
      ctaLabel: 'Go Pro',
      isPopular: false,
      isEnterprise: false,
      stripePriceId: null,
    },
    {
      id: 'audit-enterprise',
      name: 'Enterprise',
      price: 599,
      billingPeriod: 'month',
      auditsPerMonth: {
        value: 0,
        unlimited: true,
        label: 'Unlimited audits',
      },
      features: [
        'Everything in Pro',
        'Unlimited team seats',
        'Custom integrations',
        'SLA guarantee',
        'Onboarding & training',
      ],
      ctaLabel: 'Contact Sales',
      isPopular: false,
      isEnterprise: true,
      stripePriceId: null,
    },
  ],
};

export function getAuditTierById(id: string): AuditTier | undefined {
  return AUDIT_PRICING_CONFIG.tiers.find(
    (tier: AuditTier): boolean => tier.id === id
  );
}

export function getPopularAuditTier(): AuditTier | undefined {
  return AUDIT_PRICING_CONFIG.tiers.find(
    (tier: AuditTier): boolean => tier.isPopular === true
  );
}
