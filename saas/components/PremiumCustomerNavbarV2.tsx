// saas/components/PremiumCustomerNavbarV2.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import AuthModal from './AuthModal.tsx'
import { supabase } from '@/utils/supabase/client'
import { uiText } from '@/lib/i18n/uiText'

type NavItem = {
  icon: string
  labelKey: string
  fallbackLabel: string
  href?: string
  requiresOwner?: boolean
  action?: 'logout'
}

type NavGroup = {
  id: string
  labelKey: string
  fallbackLabel: string
  items: NavItem[]
}

const PURPLE = '#a78bfa'
const LANGUAGES = ['en', 'pt', 'es', 'pl', 'ru'] as const

const GROUPS: NavGroup[] = [
  {
    id: 'public-tools',
    labelKey: 'nav.publicTools.label',
    fallbackLabel: uiText('generatedUi.u_9296483909d17d1a'),
    items: [
      { icon: '◎', labelKey: 'nav.publicTools.siteReview', fallbackLabel: uiText('generatedUi.u_5976c17e6bbdd35e'), href: '/dashboard/audit' },
      { icon: '🛡️', labelKey: 'nav.publicTools.securityCheck', fallbackLabel: uiText('generatedUi.u_5b5353420d2d5a74'), href: '/cybersecurity-check' },
      { icon: '✦', labelKey: 'nav.publicTools.improveYourSite', fallbackLabel: uiText('generatedUi.u_9df13ac00553006c'), href: '/dashboard/improve' },
      { icon: '🚀', labelKey: 'nav.publicTools.websiteOptimizer', fallbackLabel: uiText('generatedUi.u_7c0cbab9b791858b'), href: '/website-optimizer' },
    ],
  },
  {
    id: 'campaigns',
    labelKey: 'nav.campaigns',
    fallbackLabel: uiText('generatedUi.u_30e9a089397b25b0'),
    items: [
      { icon: '🎥', labelKey: 'nav.campaignStudio', fallbackLabel: uiText('generatedUi.u_068bb1a34377680c'), href: '/agency' },
      { icon: '📈', labelKey: 'nav.marketingSales', fallbackLabel: uiText('generatedUi.u_dcba31525bd63b56'), href: '/dashboard/sales' },
      { icon: '🧭', labelKey: 'nav.marketingSetup', fallbackLabel: uiText('generatedUi.u_115d07a265435234'), href: '/onboarding' },
      { icon: '📧', labelKey: 'nav.emailOutreach', fallbackLabel: uiText('generatedUi.u_fb03f7ab12994d23'), href: '/dashboard/outreach' },
      { icon: '🤝', labelKey: 'nav.contacts', fallbackLabel: uiText('nav.contacts'), href: '/dashboard/outreach/contacts' },
      { icon: '📣', labelKey: 'nav.campaignConsole', fallbackLabel: uiText('generatedUi.u_5a6c6aa4a802b400'), href: '/dashboard/cosa' },
      { icon: '🎬', labelKey: 'nav.videoPipeline', fallbackLabel: uiText('generatedUi.u_36d4f0c2fcf34e05'), href: '/dashboard/cosa/video-pipeline' },
      { icon: '🗂️', labelKey: 'nav.pressPrint', fallbackLabel: uiText('generatedUi.u_ba2f8d68f462717f'), href: '/dashboard/marketing/press-print' },
      { icon: '🧾', labelKey: 'nav.pressOutreach', fallbackLabel: uiText('generatedUi.u_8dc7472b90ff7180'), href: '/dashboard/marketing/press-outreach' },
      // The DRAFT QUEUE sits above the cockpit deliberately. Approving drafts is the daily
      // job; connecting providers is setup you finish once. A menu should be ordered by how
      // often an entry is needed, not by how the features were built.
      { icon: '📝', labelKey: 'nav.pressDrafts', fallbackLabel: uiText('generatedUi.u_pressdrafts_navlabel'), href: '/dashboard/marketing/press-drafts' },
      { icon: '📰', labelKey: 'nav.pressProviders', fallbackLabel: uiText('generatedUi.u_9d597b5a530fd867'), href: '/dashboard/marketing/press-providers' },
      { icon: '📢', labelKey: 'nav.promote', fallbackLabel: uiText('generatedUi.u_5834dab085442471'), href: '/dashboard/promote' },
      { icon: '🔗', labelKey: 'nav.socialConnections', fallbackLabel: uiText('generatedUi.u_819abac9f5ab2dd3'), href: '/dashboard/outreach/social' },
      { icon: '💰', labelKey: 'nav.adsCockpit', fallbackLabel: uiText('generatedUi.u_ads_title'), href: '/dashboard/ads', requiresOwner: true },
      { icon: '🗃️', labelKey: 'nav.allCampaigns', fallbackLabel: uiText('generatedUi.u_350fd0c928342e75'), href: '/dashboard/campaigns' },
      { icon: '💡', labelKey: 'nav.opportunities', fallbackLabel: uiText('generatedUi.u_1e6e878c9dc923dd'), href: '/dashboard/opportunities' },
      { icon: '📊', labelKey: 'nav.salesPipeline', fallbackLabel: uiText('generatedUi.u_22a3534629d2dcf1'), href: '/dashboard/sales/pipeline' },
      { icon: '📨', labelKey: 'nav.myOutreach', fallbackLabel: uiText('generatedUi.u_04c411dc1ee0d29f'), href: '/dashboard/my-outreach' },
      { icon: '📇', labelKey: 'nav.admOutreachConsole', fallbackLabel: uiText('navExtra.admOutreachConsole'), href: '/admin/outreach', requiresOwner: true },
      // Background campaigns had no entry anywhere. A campaign was started from chat, a job id
      // was handed back, and the only way to see what the worker did was to know a URL nobody
      // had been told. Same defect as an acceptance page with no link to it.
      { icon: '🛰️', labelKey: 'nav.backgroundCampaigns', fallbackLabel: `${uiText('generatedUi.u_350fd0c928342e75')} — ${uiText('generatedUi.u_5a6c6aa4a802b400')}`, href: '/dashboard/outreach/campaigns', requiresOwner: true },
      { icon: '🛡️', labelKey: 'nav.outreachApprovals', fallbackLabel: uiText('outreachApprovals.title'), href: '/dashboard/hub/outreach-approvals', requiresOwner: true },
      { icon: '⛏️', labelKey: 'nav.cosMining', fallbackLabel: uiText('generatedUi.u_e595ed3d019ad2a5'), href: '/dashboard/cos-mining' },
      { icon: '🖥️', labelKey: 'nav.marketingConsole', fallbackLabel: uiText('generatedUi.u_c14b309b4fa21c68'), href: '/dashboard/marketing-sales/console' },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.operations',
    fallbackLabel: uiText('generatedUi.u_358cc201f87d9dc9'),
    items: [
      { icon: '🏠', labelKey: 'nav.dashboard', fallbackLabel: uiText('generatedUi.u_67b696468610b879'), href: '/dashboard' },
      { icon: '📅', labelKey: 'nav.calendar', fallbackLabel: uiText('generatedUi.u_d5d0a30b517e3bea'), href: '/dashboard/calendar' },
      { icon: '📑', labelKey: 'nav.spreadsheets', fallbackLabel: uiText('generatedUi.u_fdae6602c2bebdcc'), href: '/dashboard/spreadsheets' },
      { icon: '⭐', labelKey: 'nav.reviews', fallbackLabel: uiText('generatedUi.u_84cb7871b741c32e'), href: '/dashboard/reviews' },
      { icon: '🤖', labelKey: 'nav.concierge', fallbackLabel: uiText('generatedUi.u_6fd6628dffd218e9'), href: '/dashboard/assistant' },
      { icon: '💬', labelKey: 'nav.feedback', fallbackLabel: uiText('generatedUi.u_aac77df347205252'), href: '/dashboard/feedback' },
      { icon: '🔌', labelKey: 'nav.integrations', fallbackLabel: uiText('generatedUi.u_090512d93fcc3c0d'), href: '/integrations' },
      { icon: '🧰', labelKey: 'nav.integrationCatalog', fallbackLabel: uiText('generatedUi.u_int_navlabel'), href: '/dashboard/integrations' },
      { icon: '📋', labelKey: 'nav.infrastructure', fallbackLabel: uiText('generatedUi.u_ed227cdaeb4a7009'), href: '/dashboard/infrastructure' },
      { icon: '👥', labelKey: 'nav.team', fallbackLabel: uiText('generatedUi.u_5985039f106df054'), href: '/dashboard/team' },
      { icon: '⚙️', labelKey: 'nav.settings', fallbackLabel: uiText('generatedUi.u_74a883a037bc227f'), href: '/dashboard/settings' },
      { icon: '📊', labelKey: 'nav.operationsDashboard', fallbackLabel: uiText('generatedUi.u_d6027e4da26e9e17'), href: '/dashboard/operations' },
      { icon: '🧩', labelKey: 'nav.enterpriseIntegrations', fallbackLabel: uiText('generatedUi.u_78f6bc201cc6de7e'), href: '/enterprise-integration-builder' },
    ],
  },
  {
    id: 'studio',
    labelKey: 'nav.studio',
    fallbackLabel: uiText('generatedUi.u_0aa91af2ec4c1fd7'),
    items: [
      { icon: '🌐', labelKey: 'nav.websiteBuilder', fallbackLabel: uiText('generatedUi.u_b68eb23d99aa29c6'), href: '/dashboard/builder' },
      { icon: '✨', labelKey: 'nav.improveContent', fallbackLabel: uiText('generatedUi.u_2ed13e9a9e34f4b7'), href: '/dashboard/improve' },
      { icon: '🚀', labelKey: 'nav.launchpad', fallbackLabel: uiText('generatedUi.u_08c9188c5d641e94'), href: '/dashboard/launchpad' },
      { icon: '🏢', labelKey: 'nav.buildBusiness', fallbackLabel: uiText('generatedUi.u_a5efa3ab38ed3235'), href: '/dashboard/launchpad/business' },
      { icon: '🛒', labelKey: 'nav.onlineStore', fallbackLabel: uiText('generatedUi.u_c50970c1903db9ae'), href: '/dashboard/launchpad/store' },
      { icon: '🎙️', labelKey: 'nav.podcastLaunchpad', fallbackLabel: uiText('generatedUi.u_ca8fc15614d107f2'), href: '/dashboard/launchpad/podcast' },
      { icon: '🎚️', labelKey: 'nav.podcastStudio', fallbackLabel: uiText('generatedUi.u_12942e73e6627f61'), href: '/dashboard/podcast/studio' },
      { icon: '🎬', labelKey: 'nav.videoStudio', fallbackLabel: uiText('generatedUi.u_095321ec675b9643'), href: '/dashboard/video' },
      { icon: '🎧', labelKey: 'nav.audioStudio', fallbackLabel: uiText('generatedUi.u_c15e3ff611a391cb'), href: '/dashboard/audio' },
      { icon: '🛠️', labelKey: 'nav.apprentice', fallbackLabel: uiText('generatedUi.u_dbda3b1dfdc32198'), href: '/dashboard/apprentice' },
      { icon: '🎨', labelKey: 'nav.creativeStudio', fallbackLabel: uiText('generatedUi.u_c0a1ec0a03c6b0bf'), href: '/dashboard/creative' },
      { icon: '🎨', labelKey: 'nav.cosaCreative', fallbackLabel: uiText('generatedUi.u_9c73f7d33e13eb8f'), href: '/dashboard/cosa/creative' },
      { icon: '🆓', labelKey: 'nav.freeVideo', fallbackLabel: uiText('generatedUi.u_1f73646d46903441'), href: '/dashboard/cosa/video/free' },
      { icon: '🎞️', labelKey: 'nav.motionVideo', fallbackLabel: uiText('generatedUi.u_9ee9ed1ac60866b3'), href: '/dashboard/cosa/video/motion' },
      { icon: '🎙️', labelKey: 'nav.podcasters', fallbackLabel: uiText('generatedUi.u_0d74ad5328bfdd35'), href: '/podcasters' },
    ],
  },
  {
    id: 'security',
    labelKey: 'nav.security',
    fallbackLabel: uiText('generatedUi.u_8f6fb4eb7f42c0e2'),
    items: [
      { icon: '🛡️', labelKey: 'nav.cybersecurity', fallbackLabel: uiText('generatedUi.u_23b2d5dae0a87cf9'), href: '/dashboard/cybersecurity' },
      { icon: '📋', labelKey: 'nav.auditConsole', fallbackLabel: uiText('generatedUi.u_281ad82f2d803589'), href: '/dashboard/audit' },
      { icon: '🎛️', labelKey: 'nav.auditCockpit', fallbackLabel: uiText('generatedUi.u_c0c52c1e72197d6d'), href: '/hub/audit' },
    ],
  },
  {
    id: 'help',
    labelKey: 'nav.help',
    fallbackLabel: uiText('generatedUi.u_b79cac926e0b2e34'),
    items: [
      { icon: '❓', labelKey: 'nav.coreHelp', fallbackLabel: uiText('generatedUi.u_f8d47b82e285ba95'), href: '/support' },
      { icon: '📖', labelKey: 'nav.documentation', fallbackLabel: uiText('generatedUi.u_c205924de0fe636c'), href: '/docs' },
      { icon: '❔', labelKey: 'nav.faq', fallbackLabel: uiText('generatedUi.u_dbc468a14b601d5d'), href: '/faq' },
      { icon: '📝', labelKey: 'nav.requestPlan', fallbackLabel: uiText('generatedUi.u_3f7c9eb705ada714'), href: '/request-plan' },
      { icon: '↪', labelKey: 'nav.logOut', fallbackLabel: uiText('generatedUi.u_49616145514e9abf'), action: 'logout' },
    ],
  },
  {
    id: 'admin',
    labelKey: 'nav.admin',
    fallbackLabel: uiText('generatedUi.u_c1c224b03cd9bc7b'),
    items: [
      { icon: '🤖', labelKey: 'nav.cosAssistant', fallbackLabel: uiText('generatedUi.u_f7186e7e576a60ad'), href: '/dashboard/assistant', requiresOwner: true },
      { icon: '👑', labelKey: 'nav.ownerAdmin', fallbackLabel: uiText('generatedUi.u_4943e64e40762052'), href: '/admin', requiresOwner: true },

      // Owner-directed study intake (/dashboard/cos-directed-study) — feed COS a video, article
      // or book chapter by hand. Label reuses the existing assistantFeedback key (present in all
      // five locales) because a new generatedUi key would mean editing five ~3,900-key locale
      // files, and validate:i18n-locale-keys rejects plain English strings here.
      { icon: '📚', labelKey: 'nav.cosDirectedStudy', fallbackLabel: uiText('assistantFeedback.correctionPlaceholder'), href: '/dashboard/cos-directed-study', requiresOwner: true },

      // ── SELF-HEALING SUPERVISOR, IN THE ORDER THE PRODUCT IS OPERATED ──────────
      //
      // These eleven entries were previously three, scattered through this group at
      // positions 3, 8 and 9, and the other EIGHT pages could not be reached by any
      // sequence of clicks anywhere in the platform — including the demo screen built
      // for prospects to watch and the approval queue where a repair is authorised.
      // A buyer evaluating self-healing software could not get to the screen where the
      // healing is approved, which is the one screen the category is named after.
      //
      // They are now one contiguous block in WORKFLOW ORDER: connect what it watches,
      // see what it sees, decide, review what ran, then the operator surfaces. The
      // order is the answer to "where do I go next" — a reader who follows the list
      // downward is following the product's own sequence.
      //
      // Labels are COMPOSED FROM EXISTING locale keys for the reason documented below
      // on the acceptance entries: `fallbackLabel` is checked by validate:i18n-locale-keys,
      // so a plain English string here fails the guard, and new generatedUi keys would
      // mean editing five locale files of ~2,800 keys each.
      { icon: '🛑', labelKey: 'nav.supervisorSOC', fallbackLabel: uiText('generatedUi.u_67524288ec825ae4'), href: '/dashboard/supervisor', requiresOwner: true },
      { icon: '🔌', labelKey: 'nav.supervisorProviders', fallbackLabel: `${uiText('generatedUi.u_9de790933254b865')} — ${uiText('generatedUi.u_2a93e812bc1ecd33')}`, href: '/dashboard/supervisor/providers', requiresOwner: true },
      { icon: '▲', labelKey: 'nav.supervisorVercelHealth', fallbackLabel: `${uiText('generatedUi.u_68edc75c015e2e10')} — ${uiText('generatedUi.u_55898449eb74fb2e')}`, href: '/dashboard/supervisor/vercel-health', requiresOwner: true },
      { icon: '🧾', labelKey: 'nav.supervisorApprovals', fallbackLabel: uiText('generatedUi.u_07d606f7b8490c2b'), href: '/dashboard/supervisor/approvals', requiresOwner: true },
      { icon: '📜', labelKey: 'nav.supervisorExecutions', fallbackLabel: uiText('generatedUi.u_212a54cf3072409e'), href: '/dashboard/supervisor/executions', requiresOwner: true },
      { icon: '🔍', labelKey: 'nav.supervisorMissionReviews', fallbackLabel: uiText('generatedUi.u_b500898ae38ccf02'), href: '/dashboard/supervisor/missions/reviews', requiresOwner: true },
      { icon: '🧬', labelKey: 'nav.supervisorProtocolCapabilities', fallbackLabel: uiText('generatedUi.u_c38c6df0902b4c66'), href: '/dashboard/supervisor/protocol-capabilities', requiresOwner: true },
      { icon: '🛰️', labelKey: 'nav.supervisorHa', fallbackLabel: uiText('generatedUi.u_4f794af09d6d3e3c'), href: '/dashboard/supervisor/ha', requiresOwner: true },
      { icon: '✅', labelKey: 'nav.supervisorAcceptance', fallbackLabel: uiText('generatedUi.u_68cb08a39a30554a'), href: '/dashboard/supervisor/acceptance', requiresOwner: true },
      // The prospect-facing pair. The operator runs the first on a screen share; the
      // second is the read-only record a prospect opens later with no account at all.
      { icon: '🎬', labelKey: 'nav.supervisorDemo', fallbackLabel: `${uiText('generatedUi.u_9de790933254b865')} — ${uiText('generatedUi.u_75c419ef704f82fe')}`, href: '/dashboard/supervisor/demo', requiresOwner: true },
      { icon: '🔗', labelKey: 'nav.supervisorPublicDemo', fallbackLabel: `${uiText('generatedUi.u_75c419ef704f82fe')} — ${uiText('generatedUi.u_14269d3cc697c30f')}`, href: '/demo/supervisor', requiresOwner: true },
      // Mints licence credentials, so it is owner-only and sits last, away from the
      // demo entries — a prospect watching a screen share must never see this screen.
      { icon: '🔑', labelKey: 'nav.supervisorLicense', fallbackLabel: `${uiText('generatedUi.u_9de790933254b865')} — ${uiText('generatedUi.u_f3ec8e880a46c8a6')}`, href: '/dashboard/supervisor/license', requiresOwner: true },
      // ── end Supervisor block ───────────────────────────────────────────────────
      { icon: '🎛️', labelKey: 'nav.consoleHub', fallbackLabel: uiText('generatedUi.u_3cbf6d117f4dc1b5'), href: '/hub', requiresOwner: true },
      { icon: '🔐', labelKey: 'nav.vault', fallbackLabel: uiText('generatedUi.u_e7ccb35263c6b8a0'), href: '/vault', requiresOwner: true },
      { icon: '🧠', labelKey: 'nav.cosHub', fallbackLabel: uiText('generatedUi.u_a4a4f4e10a389fd8'), href: '/hub/cos', requiresOwner: true },
      { icon: '🚀', labelKey: 'nav.onboardingAdmin', fallbackLabel: uiText('generatedUi.u_6cda524ff713f2b8'), href: '/admin/onboarding', requiresOwner: true },
      // Acceptance runs for the other two portables that produce their evidence on THIS
      // deployment. They existed as pages with no way to reach them, which is the same defect
      // as an acceptance harness reachable only from a CLI: the run is available in principle
      // and unavailable in practice. Placed beside the supervisor's so all three sit together.
      //
      // Their labels are COMPOSED FROM EXISTING locale keys — "Press media" / "Provider Hub"
      // plus "Run acceptance" — rather than from new generatedUi keys. Two reasons, and the
      // first is a guard: `fallbackLabel` is a checked property, so a plain English string here
      // fails validate:i18n-locale-keys (it did, before this comment existed). The second is
      // that adding new generatedUi keys means editing five locale files of ~2,800 keys each,
      // and a slot swap there has cost real time twice. Composition translates today in all
      // five languages, and the declared labelKeys let a future locale entry override the
      // composed label with a hand-written one.
      { icon: '📰', labelKey: 'nav.pressAcceptance', fallbackLabel: `${uiText('generatedUi.u_85c253de08e70759')} — ${uiText('generatedUi.u_96385fbce0625bd2')}`, href: '/dashboard/press-media/acceptance', requiresOwner: true },
      { icon: '🧩', labelKey: 'nav.providerHubAcceptance', fallbackLabel: `${uiText('generatedUi.u_a082185bfb56e8e0')} — ${uiText('generatedUi.u_96385fbce0625bd2')}`, href: '/dashboard/provider-hub/acceptance', requiresOwner: true },
      { icon: '🧩', labelKey: 'nav.providerHubStatus', fallbackLabel: uiText('generatedUi.u_9a955057059a488c'), href: '/dashboard/provider-hub', requiresOwner: true },
      { icon: '📚', labelKey: 'nav.portableCatalog', fallbackLabel: uiText('generatedUi.u_44a4613ddb65eac0'), href: '/dashboard/portable-products', requiresOwner: true },
      { icon: '📦', labelKey: 'nav.portableReadiness', fallbackLabel: uiText('generatedUi.u_627f029b2aaae158'), href: '/dashboard/portable-products/readiness', requiresOwner: true },
      { icon: '📊', labelKey: 'nav.adminOverview', fallbackLabel: uiText('generatedUi.u_9ccfc43a0487068a'), href: '/admin/overview', requiresOwner: true },
      { icon: '💰', labelKey: 'nav.adminRevenue', fallbackLabel: uiText('generatedUi.u_8e2318e66508c35e'), href: '/admin/revenue', requiresOwner: true },
      { icon: '⚙️', labelKey: 'nav.adminSettings', fallbackLabel: uiText('generatedUi.u_1f87f883cc7e9c47'), href: '/admin/settings', requiresOwner: true },
      { icon: '📨', labelKey: 'nav.hubEmailHealth', fallbackLabel: uiText('generatedUi.u_273085d2c705ed33'), href: '/hub/audit/email', requiresOwner: true },
      { icon: '▲', labelKey: 'nav.hubVercel', fallbackLabel: uiText('generatedUi.u_a3ee7cfb19f57ef7'), href: '/hub/vercel', requiresOwner: true },
    ],
  },
]

function pathFor(href: string) {
  return href.split('?')[0]
}

function itemIsActive(pathname: string | null, href?: string) {
  if (!href || !pathname) return false
  const path = pathFor(href)
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`))
}

export default function PremiumCustomerNavbarV2() {
  const navRef = useRef<HTMLElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { t, lang, setLang } = useTranslation()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')

  const ownerAccess = isAdmin || isOwner
  const groups = useMemo(
    () => GROUPS.map(group => ({
      ...group,
      items: group.items.filter(item => !item.requiresOwner || ownerAccess),
    })).filter(group => group.items.length > 0 && group.items.some(item => item.action !== 'logout' || user)),
    [ownerAccess, user],
  )

  const searchableItems = useMemo(
    () => [
      { icon: '⌂', label: t('nav.home', "Home"), href: '/' },
      { icon: '▦', label: t('nav.platform', "Platform"), href: '/home' },
      { icon: '💳', label: t('nav.pricing', "Pricing"), href: '/pricing' },
      ...groups.flatMap(group => group.items.filter(item => item.href).map(item => ({
        ...item,
        label: t(item.labelKey, item.fallbackLabel),
      }))),
    ],
    [groups, t],
  )

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const searchResults = searchableItems.filter(item => item.label.toLocaleLowerCase().includes(normalizedQuery))

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      setIsOwner(false)
      return
    }
    let cancelled = false
    async function loadRole(attempt = 0): Promise<void> {
      try {
        const response = await fetch('/api/credits', { cache: 'no-store' })
        if (!response.ok) {
          // A non-200 (transient 401/500) must NOT silently strip an owner/admin
          // of their navigation. Retry once, then leave the last known role
          // untouched rather than hiding privileged items.
          if (attempt < 1 && !cancelled) return loadRole(attempt + 1)
          return
        }
        const data = await response.json()
        if (cancelled) return
        setIsAdmin(Boolean(data.isAdmin))
        setIsOwner(Boolean(data.isOwner))
        if (typeof data.credits === 'number') setCredits(data.credits)
      } catch {
        // Network error: retry once, then keep existing role — never hide controls.
        if (attempt < 1 && !cancelled) return loadRole(attempt + 1)
      }
    }
    loadRole()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
    setSearchOpen(false)
    setQuery('')
  }, [pathname])

  useEffect(() => {
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
        setSearchOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function selectSearchResult(href: string) {
    setSearchOpen(false)
    setQuery('')
    router.push(href)
  }

  function renderItem(item: NavItem, mobile = false) {
    const label = t(item.labelKey, item.fallbackLabel)
    if (item.action === 'logout') {
      return user ? (
        <button key={item.labelKey} type="button" onClick={handleLogout} className={mobile ? 'sbnav-mobile-row' : 'sbnav-row'}>
          <span aria-hidden>{item.icon}</span><span>{label}</span>
        </button>
      ) : null
    }
    if (!item.href) return null
    return (
      <Link key={`${item.labelKey}-${item.href}`} href={item.href} onClick={() => { setOpenMenu(null); setMobileOpen(false) }} className={mobile ? 'sbnav-mobile-row' : 'sbnav-row'}>
        <span aria-hidden>{item.icon}</span><span>{label}</span>
      </Link>
    )
  }

  return (
    <>
      <style>{`
        .sbnav { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 14px; padding: 11px 22px; background: rgba(4, 8, 18, .95); border-bottom: 1px solid rgba(167, 139, 250, .35); backdrop-filter: blur(14px); }
        .sbnav-brand, .sbnav-trigger, .sbnav-row, .sbnav-mobile-row { color: #f8fafc; text-decoration: none; font: inherit; }
        .sbnav-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 900; white-space: nowrap; }
        .sbnav-brand-mark { color: ${PURPLE}; font-size: 24px; }
        .sbnav-desktop { display: flex; align-items: center; gap: 5px; min-width: 0; }
        .sbnav-menu { position: relative; }
        .sbnav-trigger { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 999px; padding: 8px 10px; background: transparent; cursor: pointer; color: rgba(226,232,240,.76); font-size: 13px; font-weight: 700; white-space: nowrap; }
        .sbnav-trigger:hover, .sbnav-trigger-active { color: #fff; background: rgba(167,139,250,.16); border-color: ${PURPLE}; }
        .sbnav-pricing { color: #f8fafc; border-color: rgba(255,195,0,.55); background: rgba(255,195,0,.08); }
        .sbnav-pricing:hover, .sbnav-pricing.sbnav-trigger-active { border-color: #ffc300; background: rgba(255,195,0,.18); }
        .sbnav-dropdown { position: absolute; top: calc(100% + 10px); left: 0; z-index: 120; display: grid; gap: 3px; min-width: 250px; max-height: min(70vh, 560px); overflow-y: auto; padding: 8px; border: 1px solid rgba(167,139,250,.45); border-radius: 14px; background: #0f172a; box-shadow: 0 18px 45px rgba(0,0,0,.42); }
        .sbnav-row, .sbnav-mobile-row { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-radius: 9px; padding: 9px 10px; background: transparent; cursor: pointer; text-align: left; color: rgba(226,232,240,.84); font-size: 13px; }
        .sbnav-row:hover, .sbnav-mobile-row:hover { background: rgba(255,255,255,.07); color: #fff; }
        .sbnav-search { position: relative; margin-left: auto; width: min(250px, 22vw); flex: 0 1 250px; min-width: 0; }
        .sbnav-search input { width: 100%; box-sizing: border-box; border: 1px solid rgba(167,139,250,.5); border-radius: 999px; padding: 8px 12px; background: rgba(15,23,42,.9); color: #fff; font: inherit; font-size: 13px; outline: none; }
        .sbnav-search input:focus { border-color: ${PURPLE}; box-shadow: 0 0 0 3px rgba(167,139,250,.16); }
        .sbnav-search-results { right: 0; left: auto; max-height: 320px; overflow-y: auto; }
        .sbnav-credits { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(255,195,0,.55); border-radius: 999px; padding: 8px 12px; background: rgba(255,195,0,.10); color: #ffe08a; font-size: 13px; font-weight: 800; white-space: nowrap; }
        .sbnav-language { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 8px 10px; background: #0f172a; color: #e2e8f0; font: inherit; font-size: 12px; }
        .sbnav-auth, .sbnav-burger { border: 0; border-radius: 999px; padding: 8px 13px; background: ${PURPLE}; color: #160b2b; font: inherit; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .sbnav-sign-in { border: 1px solid rgba(255,255,255,.22); background: transparent; color: #f8fafc; }
        .sbnav-burger { display: none; border-radius: 10px; color: #fff; background: transparent; border: 1px solid rgba(255,255,255,.2); }
        .sbnav-mobile { display: none; }
        @media (min-width: 1651px) and (max-width: 2050px) { .sbnav { gap: 9px; padding-inline: 16px; } .sbnav-desktop { gap: 1px; } .sbnav-trigger { padding-inline: 7px; } .sbnav-search { width: 180px; flex-basis: 180px; } }
        @media (min-width: 1281px) and (max-width: 1650px) { .sbnav { gap: 9px; padding-inline: 16px; } .sbnav-desktop { display: flex; gap: 1px; } .sbnav-trigger { padding-inline: 7px; } .sbnav-search { width: 180px; flex-basis: 180px; } .sbnav-platform-link { display: none; } }
        @media (max-width: 1280px) { .sbnav-desktop, .sbnav-search, .sbnav-language, .sbnav-auth, .sbnav-credits { display: none; } .sbnav-burger { display: inline-flex; margin-left: auto; } .sbnav-mobile { display: grid; gap: 13px; max-height: calc(100vh - 62px); overflow-y: auto; padding: 14px 20px 20px; background: #070d1c; border-bottom: 1px solid rgba(167,139,250,.35); } .sbnav-mobile-group { display: grid; gap: 4px; } .sbnav-mobile-label { color: ${PURPLE}; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; } .sbnav-mobile-search { width: 100%; } .sbnav-mobile-search .sbnav-dropdown { position: static; margin-top: 8px; } }
      `}</style>
      <nav className="sbnav" ref={navRef}>
        <Link href="/" className="sbnav-brand"><span className="sbnav-brand-mark" aria-hidden>⌁</span><span>{uiText('generatedUi.u_7bc314f625464478')}</span></Link>
        <div className="sbnav-desktop">
          <Link href="/" className={`sbnav-trigger ${itemIsActive(pathname, '/') ? 'sbnav-trigger-active' : ''}`}>{t('nav.home', "Home")}</Link>
          <Link href="/home" className={`sbnav-trigger sbnav-platform-link ${itemIsActive(pathname, '/home') ? 'sbnav-trigger-active' : ''}`}>{t('nav.platform', "Platform")}</Link>
          <Link href="/pricing" className={`sbnav-trigger sbnav-pricing ${itemIsActive(pathname, '/pricing') ? 'sbnav-trigger-active' : ''}`}>{t('nav.pricing', "Pricing")}</Link>
          {groups.map(group => {
            const open = openMenu === group.id
            const active = group.items.some(item => itemIsActive(pathname, item.href))
            return (
              <div className="sbnav-menu" key={group.id}>
                <button type="button" className={`sbnav-trigger ${active ? 'sbnav-trigger-active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpenMenu(open ? null : group.id)}>
                  {t(group.labelKey, group.fallbackLabel)} <span aria-hidden>▾</span>
                </button>
                {open ? <div className="sbnav-dropdown" role="menu">{group.items.map(item => renderItem(item))}</div> : null}
              </div>
            )
          })}
        </div>
        <div className="sbnav-search">
          <input type="search" value={query} placeholder={t('nav.searchPlaceholder', "Search sections")} aria-label={t('nav.searchLabel', "Search navigation")} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
          {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults', "No matching sections")}</span>}</div> : null}
        </div>
        {user ? <span className="sbnav-credits" aria-live="polite" title={t('nav.credits.label', "credits")}>⚡ {ownerAccess ? t('nav.credits.unlimited', "Unlimited") : (credits === null ? '…' : credits.toLocaleString())}</span> : null}
        <select className="sbnav-language" value={lang} aria-label={t('nav.languageLabel', "Language")} onChange={event => setLang(event.target.value)}>{LANGUAGES.map(code => <option key={code} value={code}>{t(`nav.languages.${code}`, code.toUpperCase())}</option>)}</select>
        {user ? null : <><button type="button" className="sbnav-auth sbnav-sign-in" onClick={() => { setAuthMode('login'); setShowAuth(true) }}>{t('auth.logIn', "Sign in")}</button><button type="button" className="sbnav-auth" onClick={() => { setAuthMode('signup'); setShowAuth(true) }}>{t('auth.createAccount', "Create account")}</button></>}
        <button type="button" className="sbnav-burger" aria-label={t('nav.menu', "Menu")} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>{mobileOpen ? '✕' : '☰'}</button>
      </nav>
      {mobileOpen ? (
        <div className="sbnav-mobile">
          {user ? <div className="sbnav-mobile-row" aria-live="polite">⚡ <span>{ownerAccess ? t('nav.credits.unlimited', "Unlimited") : (credits === null ? '…' : credits.toLocaleString())} {t('nav.credits.label', "credits")}</span></div> : null}
          <div className="sbnav-search sbnav-mobile-search">
            <input type="search" value={query} placeholder={t('nav.searchPlaceholder', "Search sections")} aria-label={t('nav.searchLabel', "Search navigation")} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true) }} />
            {searchOpen ? <div className="sbnav-dropdown sbnav-search-results" role="listbox">{searchResults.length ? searchResults.map(item => <button key={item.href} type="button" className="sbnav-row" role="option" onClick={() => selectSearchResult(item.href!)}>{item.icon}<span>{item.label}</span></button>) : <span className="sbnav-row">{t('nav.noSearchResults', "No matching sections")}</span>}</div> : null}
          </div>
          <Link href="/" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">⌂<span>{t('nav.home', "Home")}</span></Link>
          <Link href="/home" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">▦<span>{t('nav.platform', "Platform")}</span></Link>
          <Link href="/pricing" onClick={() => setMobileOpen(false)} className="sbnav-mobile-row">💳<span>{t('nav.pricing', "Pricing")}</span></Link>
          {groups.map(group => <div key={group.id} className="sbnav-mobile-group"><span className="sbnav-mobile-label">{t(group.labelKey, group.fallbackLabel)}</span>{group.items.map(item => renderItem(item, true))}</div>)}
          {user ? null : <><button type="button" className="sbnav-auth sbnav-sign-in" onClick={() => { setMobileOpen(false); setAuthMode('login'); setShowAuth(true) }}>{t('auth.logIn', "Sign in")}</button><button type="button" className="sbnav-auth" onClick={() => { setMobileOpen(false); setAuthMode('signup'); setShowAuth(true) }}>{t('auth.createAccount', "Create account")}</button></>}
        </div>
      ) : null}
      {showAuth ? <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
