// saas/lib/ai/cos/cosBeliefs.ts
//
// STATIC IDEAS LAYER — COS's stable beliefs about how this business works.
// The owner revises these over time; COS only reads them, never edits them.
//
// v1 matches objectives to beliefs by `signals` (term matching).
// v2 will replace signal-matching with LLM semantic matching against `describes`.

import type { CosChannel, CosSourceType } from './reasoningTypes.ts';

export interface SourceBelief {
  id: CosSourceType;
  describes: string;
  signals: string[];
  liveFactsOnly: boolean; // current quantity/state — never answerable from memory
  mustUseTool: boolean;
}

export interface ChannelBelief {
  id: CosChannel;
  describes: string;
  signals: string[];
  messageFrame: string;
  metricsToWatch: string[];
}

export interface SensitiveCategory {
  id: string;
  describes: string;
  signals: string[];
}

export interface SafeInternalAction {
  id: string;
  describes: string;
  signals: string[];
}

// Order = precedence. First belief whose signals match wins.
// New-company / buyer discovery must route to the live public web before the
// internal CRM belief. Existing saved leads still route to crm_or_leads.
export const SOURCE_BELIEFS: readonly SourceBelief[] = [
  {
    id: 'signalboost_public_website',
    describes:
      'What the public SignalBoost site DISPLAYS to visitors — homepage claims, the affiliate/partner count shown publicly, marketing copy on signalboostapp.com.',
    signals: [
      'signalboostapp.com', 'signalboostapp', 'homepage', 'home page',
      'public site', 'public website', 'shown on', 'displayed on',
      'on the site', 'on the website', 'landing page',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'internal_database',
    describes:
      'Private records in our database — user counts, revenue, subscriptions, internal affiliate/partner rows, admin metrics, customer data.',
    signals: [
      'how many users', 'user count', 'users', 'revenue', 'mrr', 'arr',
      'subscription', 'subscriptions', 'subscriber', 'paying', 'customer',
      'customers', 'affiliate', 'affiliates', 'partner record', 'admin metric',
      'database', ' db ',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'live_public_website',
    describes:
      'Current public facts outside SignalBoost, including new-company discovery, buyer research, competitor information, market data, leadership, services, size, and public professional profiles.',
    signals: [
      'competitor', 'competitors', 'market', 'trending', 'latest',
      'current price of', 'who is', 'news', 'on the web',
      'potential buyer', 'potential buyers', 'design partner', 'design partners',
      'prospect list', 'find companies', 'find businesses', 'find potential',
      'qualified companies', 'qualification score', 'linkedin profile',
      'managed service provider', 'managed cloud-service provider',
      'cloud-focused msp', 'devops consultancy', 'sre consultancy',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'crm_or_leads',
    describes:
      'Existing saved sales and outreach records already inside SignalBoost — the lead pipeline, saved prospects, queued drafts, and known contacts. It is not a source for discovering new companies.',
    signals: [
      'my leads', 'existing leads', 'saved leads', 'lead pipeline', 'sales pipeline',
      'saved prospects', 'existing prospects', 'outreach queue', 'queued outreach',
      'outreach drafts', 'known contacts', 'contact records',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'github_repo',
    describes:
      'The codebase — code, files, bugs, repository structure, commits, branches, implementation details.',
    signals: [
      'code', 'codebase', 'file', 'files', 'bug', 'bugs', 'repo', 'repository',
      'commit', 'commits', 'branch', 'branches', 'function', 'implementation',
      'import', 'module',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'vercel_deployment',
    describes:
      'Production/hosting — deployments, build logs, environment variables, Vercel, domains, DNS, production errors and failures.',
    signals: [
      'deploy', 'deployment', 'build log', 'build logs', 'env var',
      'environment variable', 'vercel', 'domain', 'dns', 'production error',
      'production failure', 'production down', 'hosting',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'analytics',
    describes:
      'Traffic and performance — visitors, traffic, conversion, SEO, funnels, attribution, campaign performance.',
    signals: [
      'visitor', 'visitors', 'traffic', 'conversion rate', 'conversions', 'seo',
      'funnel', 'funnels', 'attribution', 'campaign performance',
      'click-through', 'ctr', 'bounce rate', 'sessions',
    ],
    liveFactsOnly: true,
    mustUseTool: true,
  },
  {
    id: 'owner_memory',
    describes:
      "The owner's stated PREFERENCES, past decisions, and standing instructions. Valid ONLY for preferences/decisions — NEVER for a current quantity or live state.",
    signals: [
      'my preference', 'what did i decide', 'standing instruction',
      'do i usually', 'my usual', 'remember that i',
    ],
    liveFactsOnly: false,
    mustUseTool: true,
  },
  {
    id: 'no_tool_required',
    describes: 'General strategy questions that do not depend on any current fact.',
    signals: [], // fallback only
    liveFactsOnly: false,
    mustUseTool: false,
  },
];

export const CHANNEL_BELIEFS: readonly ChannelBelief[] = [
  {
    id: 'video',
    describes:
      'Video/awareness content — YouTube, reels, shorts, TikTok, demos, explainers, brand awareness.',
    signals: ['video', 'youtube', 'reel', 'reels', 'short', 'shorts', 'tiktok', 'demo', 'explainer', 'awareness', 'brand'],
    messageFrame: 'Punchy hook, visual proof, short CTA.',
    metricsToWatch: ['views', 'watch-through rate', 'click-through to site'],
  },
  {
    id: 'outreach',
    describes: 'Direct outreach to prospects and partners.',
    signals: ['lead', 'leads', 'prospect', 'prospects', 'outreach', 'partner', 'partners', 'hotel', 'hotels', 'restaurant', 'restaurants', 'agency', 'agencies', 'email campaign'],
    messageFrame: 'Company-specific value, one CTA, no guaranteed claims.',
    metricsToWatch: ['reply rate', 'meetings booked', 'partner conversion'],
  },
  {
    id: 'pricing_or_offer',
    describes: 'Pricing, plans, offers, and revenue framing.',
    signals: ['pricing', 'price', 'discount', 'subscription', 'revenue', 'plan', 'tier', 'offer', 'conversion'],
    messageFrame: 'ROI framing, value ladder, avoid discounting unless explicit.',
    metricsToWatch: ['conversion rate', 'ARPU', 'churn'],
  },
  {
    id: 'trust_content',
    describes: 'Trust, security, and compliance content.',
    signals: ['security', 'compliance', 'audit', 'trust', 'privacy', 'risk', 'policy', 'documentation'],
    messageFrame: 'Credibility, audit trail, safety, proof.',
    metricsToWatch: ['engagement on trust pages', 'objections raised', 'security-driven signups'],
  },
  {
    id: 'analysis_only',
    describes: 'Default when the objective is a question, a strategy ask, infra work, or otherwise has no marketing channel.',
    signals: [], // fallback only
    messageFrame: 'Explain what is known, what is missing, and the next best action.',
    metricsToWatch: ['decision quality', 'time-to-answer'],
  },
];

// The reflex's editable target list. The approval-floor mechanism is fixed in
// code; WHICH actions count as sensitive lives here so the owner can tune it.
// A match here ALWAYS wins over SAFE_INTERNAL_ACTIONS below, no exceptions.
export const SENSITIVE_CATEGORIES: readonly SensitiveCategory[] = [
  { id: 'public-facing communication', describes: 'Anything published or shown publicly.', signals: ['publish', 'post ', 'go live', 'make a video', 'make a post', 'tweet', 'announce', 'launch'] },
  { id: 'email sending', describes: 'Sending email to anyone.', signals: ['send email', 'email them', 'send the email', 'send a campaign', 'blast'] },
  { id: 'social publishing', describes: 'Posting to social platforms.', signals: ['post to', 'publish to', 'tiktok', 'instagram', 'youtube upload', 'schedule post'] },
  { id: 'paid ads', describes: 'Spending on advertising.', signals: ['run ads', 'paid ad', 'ad spend', 'boost post', 'google ads', 'meta ads'] },
  { id: 'pricing changes', describes: 'Changing prices, plans, or offers.', signals: ['change price', 'change pricing', 'update plan', 'set price', 'new tier', 'raise price', 'lower price'] },
  { id: 'financial actions', describes: 'Money movement or billing.', signals: ['charge', 'refund', 'invoice', 'payout', 'bill the', 'stripe charge'] },
  { id: 'database writes', describes: 'Writing to the database.', signals: ['insert', 'update record', 'write to', 'set in db', 'save to database', 'create record'] },
  { id: 'deleting or modifying records', describes: 'Destroying or altering records.', signals: ['delete', 'remove record', 'drop table', 'wipe', 'purge', 'modify record'] },
  { id: 'production deployment', describes: 'Shipping to production.', signals: ['deploy', 'ship to production', 'release', 'promote to prod', 'go to production'] },
  { id: 'DNS/domain changes', describes: 'Changing DNS or domains.', signals: ['dns', 'update dns', 'change domain', 'mx record', 'cname', 'nameserver'] },
  { id: 'Vercel/environment variable changes', describes: 'Changing env/config.', signals: ['env var', 'environment variable', 'change config', 'set secret', 'rotate key'] },
  { id: 'GitHub merge or production code', describes: 'Merging or changing prod code.', signals: ['merge', 'merge to main', 'push to main', 'commit to main', 'production code'] },
  { id: 'contacting leads or customers', describes: 'Reaching out to people.', signals: ['contact', 'reach out', 'message them', 'partner with', 'partners with', 'cold email', 'dm them'] },
];

// Internal-only COSA operations. Nothing external happens, nothing is spent,
// and nothing leaves the private queue. A sensitive match above always wins.
export const SAFE_INTERNAL_ACTIONS: readonly SafeInternalAction[] = [
  { id: 'draft preparation', describes: 'Drafting content that has not been sent or published anywhere.', signals: ['draft', 'prepare a draft', 'write a draft', 'draft script', 'draft a script', 'draft the'] },
  { id: 'content generation', describes: 'Generating scripts, storyboards, or copy variants inside the private queue.', signals: ['generate', 'write a script', 'write script', 'storyboard', 'outline'] },
  { id: 'rendering and production', describes: 'Producing video/audio assets that stay in the private queue until approved.', signals: ['render', 'render the video', 'compose the video', 'add voice', 'add branding', 'brand the video'] },
  { id: 'analysis and scoring', describes: 'Analyzing or scoring already-drafted work; produces no external effect.', signals: ['score', 'analyze', 'evaluate', 'compare', 'summarize', 'review the draft', 'check readiness'] },
  { id: 'internal queueing', describes: 'Moving work between internal queue stages, never past the approval gate.', signals: ['queue', 'requeue', 'move to review', 'stage for approval'] },
];

// Verbs that mean "do something in the world." "find" remains excluded because
// research is read-only. Negated verbs are filtered in reasoningCore.ts.
export const ACTION_VERBS: readonly string[] = [
  'make', 'create', 'build', 'send', 'publish', 'post', 'launch', 'deploy',
  'update', 'change', 'delete', 'remove', 'add', 'set', 'run', 'charge',
  'refund', 'merge', 'push', 'contact', 'reach out', 'email', 'partner with',
  'schedule', 'rotate', 'wipe', 'purge', 'drop',
];

export const CURRENT_FACT_SIGNALS: readonly string[] = [
  'how many', 'how much', 'what is the current', 'count', 'number of',
  'right now', 'currently', 'today', 'latest',
];
