export type AdminMetric = {
  key: string
  label: string
  value?: string | number
  helper?: string
}

export type AdminSectionConfig = {
  title: string
  description: string
  metrics: AdminMetric[]
  tableTitle: string
  tableColumns: string[]
}

const unknown = 'Not tracked yet'

export const ADMIN_SECTIONS: Record<string, AdminSectionConfig> = {
  overview: {
    title: 'Overview',
    description: 'Cross-platform command center for growth, activity, and business health.',
    metrics: [
      'total users','new users today','new users this week','new users this month','active users','total projects created','total websites created','total podcasts/audio jobs','total videos/captions','total reviews collected','total AI requests','total failed AI requests','total emails drafted/sent','total leads discovered','total sales pipeline value'
    ].map((label, i) => ({ key: `overview-${i}`, label, value: unknown })),
    tableTitle: 'Recent trend snapshots',
    tableColumns: ['Area', 'Latest', '7D change', 'Status'],
  },

  adm: { title: 'ADM Console', description: 'Admin Command Center for AI Outreach, predictive intelligence, approvals, security, and Digits integration.', metrics: ['pending outreach','approved outreach','sent outreach','daily send limit','predicted review needs','predicted website redesign needs','AI task errors','security events','panic switch'].map((l,i)=>({key:`adm-${i}`,label:l,value:unknown})), tableTitle:'ADM operational queue', tableColumns:['Business','Status','Predicted need','Action'] },
  signalboost: { title: 'SignalBoost Analytics', description: 'Traffic, search and partner conversion behavior.', metrics: ['visitors','searches','concierge queries','partner clicks','top partner categories','top regions/countries','returning visitors','popular search terms','partner conversion clicks'].map((l,i)=>({key:`sb-${i}`,label:l,value:unknown})), tableTitle:'Top search and partner activity', tableColumns:['Metric','Value','Region','Notes'] },
  saas: { title: 'SaaSSignal Analytics', description: 'Product adoption, feature usage, and plan behavior.', metrics: ['signups','active users','projects per user','website builder usage','audio usage','video usage','review collector usage','AI assistant usage','language usage','plan distribution'].map((l,i)=>({key:`saas-${i}`,label:l,value:unknown})), tableTitle:'Product usage breakdown', tableColumns:['Feature','Users','Usage rate','Trend'] },
  sales: { title: 'Sales / Outreach', description: 'Prospecting throughput and conversion execution.', metrics: ['prospects discovered','prospects approved','sketches generated','emails drafted','emails sent','replies received','meetings booked','clients won','daily outreach count','response rate','conversion rate','top industries','top countries','next follow-ups'].map((l,i)=>({key:`sales-${i}`,label:l,value:unknown})), tableTitle:'Pipeline and follow-ups', tableColumns:['Stage','Count','Conversion','Owner'] },
  revenue: { title: 'Revenue', description: 'Monetization, churn and plan economics.', metrics: ['free users','paid users','MRR','plan upgrades','cancellations','trial users','estimated monthly value','revenue by plan','revenue by country'].map((l,i)=>({key:`rev-${i}`,label:l,value:unknown})), tableTitle:'Plan and revenue performance', tableColumns:['Plan/Country','Users','Revenue','Change'] },
  ai: { title: 'AI Operations', description: 'Provider reliability, costs and AI routing health.', metrics: ['AI requests by provider','OpenAI usage','Anthropic usage','failed AI calls','average response time','most common user intents','prompt intelligence results','action router intents','culture engine usage','cost estimate'].map((l,i)=>({key:`ai-${i}`,label:l,value:unknown})), tableTitle:'AI quality and cost', tableColumns:['Provider/Intent','Volume','Failure rate','Latency'] },
  email: { title: 'Email / Marketing', description: 'Marketing and sales email volume and performance.', metrics: ['marketing emails drafted','sales emails drafted','emails sent','bounce/failure counts','reply counts','campaign performance','best performing subject lines','unsubscribe/opt-out count'].map((l,i)=>({key:`email-${i}`,label:l,value:unknown})), tableTitle:'Campaign outcomes', tableColumns:['Campaign','Sent','Replies','Performance'] },
  partners: { title: 'Partners', description: 'Partner demand, performance and supply gaps.', metrics: ['partner list','active partners','partner clicks','best performing partners','categories with most demand','countries with most partner activity','missing partner categories'].map((l,i)=>({key:`partner-${i}`,label:l,value:unknown})), tableTitle:'Partner performance table', tableColumns:['Partner/Category','Clicks','Country','Notes'] },
  system: { title: 'System Health', description: 'Operational reliability and automation status.', metrics: ['API errors','failed builds/deployments','Supabase connection status','Vercel/deployment status','cron job status','daily job results','last successful outreach run','last successful prospect discovery run'].map((l,i)=>({key:`sys-${i}`,label:l,value:unknown})), tableTitle:'Operational checks', tableColumns:['Service','Status','Last checked','Details'] },
  settings: { title: 'Settings', description: 'Owner controls for admin access and automation safety.', metrics: ['admin users','email sending controls','daily outreach limits','AI provider preferences','safety controls','manual approval required toggle','competitor recommendation blocking','culture engine rules'].map((l,i)=>({key:`set-${i}`,label:l,value:unknown})), tableTitle:'Administrative controls', tableColumns:['Setting','Current value','Updated','Owner notes'] },
}
