'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

type Item = { icon: string; key: string; href: string }
type LocalizedItem = { icon: string; label: string; href: string; desc?: string }

const WEBSITE: Item[] = [
  { icon: '🌐', key: 'web.build', href: '/dashboard/builder' },
  { icon: '🧭', key: 'web.optimize', href: '/dashboard/improve' },
  { icon: '⭐', key: 'web.reviews', href: '/dashboard/reviews' },
  { icon: '✨', key: 'web.improve', href: '/dashboard/improve' },
]

const PODCAST: Item[] = [
  { icon: '🎙️', key: 'pod.build', href: '/dashboard/launchpad/podcast' },
  { icon: '🎚️', key: 'pod.optimize', href: '/dashboard/podcast/studio' },
  { icon: '📻', key: 'pod.hub', href: '/dashboard/podcast' },
  { icon: '🌍', key: 'pod.public', href: '/podcasters' },
]

const CONTENT: Item[] = [
  { icon: '🎧', key: 'con.audio', href: '/dashboard/audio' },
  { icon: '🎬', key: 'con.video', href: '/dashboard/video' },
  { icon: '🎨', key: 'con.creative', href: '/dashboard/creative' },
  { icon: '🧪', key: 'con.lab', href: '/dashboard/lab' },
  { icon: '🛠️', key: 'con.apprentice', href: '/dashboard/apprentice' },
]

const LAUNCHPAD: Item[] = [
  { icon: '🚀', key: 'lp.home', href: '/dashboard/launchpad' },
  { icon: '🏢', key: 'lp.business', href: '/dashboard/launchpad/business' },
  { icon: '🎬', key: 'lp.creator', href: '/dashboard/launchpad/creator' },
  { icon: '🛒', key: 'lp.store', href: '/dashboard/launchpad/store' },
  { icon: '🎙️', key: 'lp.podcast', href: '/dashboard/launchpad/podcast' },
]

const GROW: Item[] = [
  { icon: '🛸', key: 'grow.myOutreach', href: '/dashboard/my-outreach' },
  { icon: '📣', key: 'grow.campaigns', href: '/dashboard/campaigns' },
  { icon: '📢', key: 'grow.promote', href: '/dashboard/promote' },
  { icon: '💼', key: 'grow.sales', href: '/dashboard/sales' },
  { icon: '📈', key: 'grow.salesPipeline', href: '/dashboard/sales/pipeline' },
]

const DASHBOARD_MENU: Item[] = [
  { icon: '🏠', key: 'ws.dashboard', href: '/dashboard' },
  { icon: '📢', key: 'grow.promote', href: '/dashboard/promote' },
  { icon: '🌐', key: 'web.build', href: '/dashboard/builder' },
  { icon: '⭐', key: 'web.reviews', href: '/dashboard/reviews' },
  { icon: '🎬', key: 'con.video', href: '/dashboard/video' },
  { icon: '🎚️', key: 'pod.optimize', href: '/dashboard/podcast/studio' },
  { icon: '🛠️', key: 'con.apprentice', href: '/dashboard/apprentice' },
]

const WORKSPACE: Item[] = [
  { icon: '🏠', key: 'ws.dashboard', href: '/dashboard' },
  { icon: '🤖', key: 'ws.assistant', href: '/dashboard/assistant' },
  { icon: '📅', key: 'ws.calendar', href: '/dashboard/calendar' },
  { icon: '📑', key: 'ws.spreadsheets', href: '/dashboard/spreadsheets' },
  { icon: '💬', key: 'ws.feedback', href: '/dashboard/feedback' },
]

const ADMIN: Item[] = [
  { icon: '🛰️', key: 'adm.mission', href: '/admin' },
  { icon: '🌌', key: 'adm.overview', href: '/admin/overview' },
  { icon: '💰', key: 'adm.revenue', href: '/admin/revenue' },
  { icon: '📡', key: 'adm.radar', href: '/dashboard/opportunities' },
  { icon: '🛸', key: 'grow.hub', href: '/dashboard/outreach' },
  { icon: '🔎', key: 'grow.discovery', href: '/dashboard/outreach/discovery' },
  { icon: '📇', key: 'grow.contacts', href: '/dashboard/outreach/contacts' },
  { icon: '📊', key: 'grow.pipeline', href: '/dashboard/outreach/pipeline' },
  { icon: '🔌', key: 'adm.data', href: '/dashboard/data' },
  { icon: '⚡', key: 'adm.metrics', href: '/dashboard/metrics' },
  { icon: '🎛️', key: 'adm.console', href: '/dashboard/wireframes' },
  { icon: '👥', key: 'adm.team', href: '/dashboard/team' },
  { icon: '🛡️', key: 'adm.roles', href: '/admin/settings/roles' },
  { icon: '🚪', key: 'adm.onboarding', href: '/admin/onboarding' },
  { icon: '⚙️', key: 'adm.settings', href: '/admin/settings' },
  { icon: '🧰', key: 'adm.opSettings', href: '/dashboard/settings' },
]

const HELP: Item[] = [
  { icon: '❓', key: 'help.faq', href: '/faq' },
  { icon: '✉️', key: 'help.contact', href: '/support' },
  { icon: '📖', key: 'help.docs', href: '/docs' },
]

// ── Inline translations for every menu label + description ──────────────────────
const COPY: Record<Lang, Record<string, string>> = {
  en: {
    'group.website': 'Website', 'group.podcast': 'Podcast', 'group.content': 'Content',
    'group.launchpad': 'Launchpad', 'group.grow': 'Grow', 'group.workspace': 'Workspace',
    'group.admin': 'Admin', 'group.help': 'Help',
    'nav.home': 'Home', 'nav.dashboard': 'Dashboard', 'nav.pricing': 'Pricing', 'nav.more': 'More',
    'plan.freeDemo': 'Free Demo', 'plan.launch': 'Launch', 'plan.growth': 'Growth', 'plan.command': 'Command',
    'title.videoCredits': 'Available video credits', 'title.currentPlan': 'Current plan',
    'web.build.l': 'Build a Website', 'web.build.d': 'Generate a full site from a prompt.',
    'web.optimize.l': 'Optimize Website', 'web.optimize.d': 'Analyze, optimize, and rebuild an improved site.',
    'web.reviews.l': 'Reviews', 'web.reviews.d': 'Collect and showcase customer reviews.',
    'web.improve.l': 'Improve Content', 'web.improve.d': 'Polish pages for SEO and conversion.',
    'pod.public.l': 'For Podcasters', 'pod.public.d': 'Public page for podcast creators.', 'pod.build.l': 'Build a Podcast', 'pod.build.d': 'Start a podcast from scratch.',
    'pod.optimize.l': 'Optimize Podcast Studio', 'pod.optimize.d': 'Audit your feed for Apple, Spotify, and growth.',
    'pod.hub.l': 'Podcast Hub', 'pod.hub.d': 'Your podcast page and tools.',
    'con.audio.l': 'Audio Studio', 'con.audio.d': 'Native voice and audio content.',
    'con.video.l': 'Video Studio', 'con.video.d': 'Generate videos, clips, captions, and exports.',
    'con.creative.l': 'Creative Studio', 'con.creative.d': 'Generate promo banners and campaign visuals with AI.',
    'con.lab.l': 'Lab', 'con.lab.d': 'Experimental tools and features.',
    'con.apprentice.l': 'Workshop Apprentice', 'con.apprentice.d': 'Guided, level-aware help.',
    'lp.home.l': 'Launchpad Home', 'lp.home.d': 'Choose a guided launch path.',
    'lp.business.l': 'Build a Business', 'lp.business.d': 'Launch a business from scratch.',
    'lp.creator.l': 'Creator', 'lp.creator.d': 'Build your creator brand.',
    'lp.store.l': 'Online Store', 'lp.store.d': 'Launch a store from scratch.',
    'lp.podcast.l': 'Podcast', 'lp.podcast.d': 'Start a podcast from scratch.',
    'grow.hub.l': 'Outreach Hub', 'grow.hub.d': 'Your outreach command center.',
    'grow.discovery.l': 'Discovery', 'grow.discovery.d': 'Find and analyze new leads.',
    'grow.contacts.l': 'Contacts', 'grow.contacts.d': 'Review and approve leads.',
    'grow.pipeline.l': 'Pipeline', 'grow.pipeline.d': 'Track prospects by stage.',
    'grow.campaigns.l': 'Campaigns', 'grow.campaigns.d': 'Plan campaigns, A/B tests, and funnel tracking.',
    'grow.myOutreach.l': 'My Outreach', 'grow.myOutreach.d': 'AI-written outreach for your business — review and send.',
    'grow.promote.l': 'Promote', 'grow.promote.d': 'Run promotion campaigns.',
    'grow.sales.l': 'Sales', 'grow.sales.d': 'Sales overview.',
    'grow.salesPipeline.l': 'Sales Pipeline', 'grow.salesPipeline.d': 'Deals in progress.',
    'ws.dashboard.l': 'Dashboard', 'ws.dashboard.d': 'Your home base.',
    'ws.assistant.l': 'Assistant', 'ws.assistant.d': 'Ask the concierge anything.',
    'ws.calendar.l': 'Calendar', 'ws.calendar.d': 'Events and cultural dates.',
    'ws.spreadsheets.l': 'Spreadsheets', 'ws.spreadsheets.d': 'Your imported data, in a grid.',
    'ws.feedback.l': 'Feedback', 'ws.feedback.d': 'Send us your feedback.',
    'adm.mission.l': 'Mission Control', 'adm.mission.d': 'Unified executive admin cockpit.', 'adm.overview.l': 'Overview', 'adm.overview.d': 'Real counts from live data.',
    'adm.revenue.l': 'Revenue', 'adm.revenue.d': 'Live MRR from active subscriptions.',
    'adm.radar.l': 'Opportunity Radar', 'adm.radar.d': 'Daily AI market scan: competitors, gaps, partnerships.',
    'adm.data.l': 'Data Connectors', 'adm.data.d': 'Import and manage connected data sources.',
    'adm.metrics.l': 'Metrics & Credits', 'adm.metrics.d': 'Usage, credits, and operating metrics.',
    'adm.console.l': 'Console', 'adm.console.d': 'Office utilities and internal console.',
    'adm.team.l': 'Team & Roles', 'adm.team.d': 'Add people and set access.',
    'adm.roles.l': 'Role Management', 'adm.roles.d': 'Manage roles and ownership.',
    'adm.onboarding.l': 'Onboarding', 'adm.onboarding.d': 'Onboarding controls.',
    'adm.settings.l': 'Admin Settings', 'adm.settings.d': 'System-wide switches.',
    'adm.opSettings.l': 'Settings', 'adm.opSettings.d': 'Operational settings and account preferences.',
    'help.faq.l': 'FAQ', 'help.contact.l': 'Contact Support', 'help.docs.l': 'Documentation',
  },
  es: {
    'group.website': 'Sitio web', 'group.podcast': 'Podcast', 'group.content': 'Contenido',
    'group.launchpad': 'Launchpad', 'group.grow': 'Crecer', 'group.workspace': 'Espacio de trabajo',
    'group.admin': 'Admin', 'group.help': 'Ayuda',
    'nav.home': 'Inicio', 'nav.dashboard': 'Panel', 'nav.pricing': 'Precios', 'nav.more': 'Más',
    'plan.freeDemo': 'Demo gratis', 'plan.launch': 'Launch', 'plan.growth': 'Growth', 'plan.command': 'Command',
    'title.videoCredits': 'Créditos de video disponibles', 'title.currentPlan': 'Plan actual',
    'web.build.l': 'Crear un sitio web', 'web.build.d': 'Genera un sitio completo desde una indicación.',
    'web.optimize.l': 'Optimizar sitio web', 'web.optimize.d': 'Analiza, optimiza y reconstruye un sitio mejorado.',
    'web.reviews.l': 'Reseñas', 'web.reviews.d': 'Recopila y muestra reseñas de clientes.',
    'web.improve.l': 'Mejorar contenido', 'web.improve.d': 'Pule páginas para SEO y conversión.',
    'pod.public.l': 'Para podcasters', 'pod.public.d': 'Página pública para creadores de podcasts.', 'pod.build.l': 'Crear un podcast', 'pod.build.d': 'Inicia un podcast desde cero.',
    'pod.optimize.l': 'Optimizar estudio de podcast', 'pod.optimize.d': 'Audita tu feed para Apple, Spotify y crecimiento.',
    'pod.hub.l': 'Centro de podcast', 'pod.hub.d': 'Tu página y herramientas de podcast.',
    'con.audio.l': 'Estudio de audio', 'con.audio.d': 'Voz y contenido de audio nativos.',
    'con.video.l': 'Estudio de video', 'con.video.d': 'Genera videos, clips, subtítulos y exportaciones.',
    'con.creative.l': 'Estudio creativo', 'con.creative.d': 'Genera banners promocionales y visuales de campaña con IA.',
    'con.lab.l': 'Laboratorio', 'con.lab.d': 'Herramientas y funciones experimentales.',
    'con.apprentice.l': 'Aprendiz del taller', 'con.apprentice.d': 'Ayuda guiada según tu nivel.',
    'lp.home.l': 'Inicio de Launchpad', 'lp.home.d': 'Elige una ruta de lanzamiento guiada.',
    'lp.business.l': 'Crear un negocio', 'lp.business.d': 'Lanza un negocio desde cero.',
    'lp.creator.l': 'Creador', 'lp.creator.d': 'Construye tu marca de creador.',
    'lp.store.l': 'Tienda en línea', 'lp.store.d': 'Lanza una tienda desde cero.',
    'lp.podcast.l': 'Podcast', 'lp.podcast.d': 'Inicia un podcast desde cero.',
    'grow.hub.l': 'Centro de prospección', 'grow.hub.d': 'Tu centro de mando de prospección.',
    'grow.discovery.l': 'Descubrimiento', 'grow.discovery.d': 'Encuentra y analiza nuevos prospectos.',
    'grow.contacts.l': 'Contactos', 'grow.contacts.d': 'Revisa y aprueba prospectos.',
    'grow.pipeline.l': 'Embudo', 'grow.pipeline.d': 'Sigue prospectos por etapa.',
    'grow.campaigns.l': 'Campañas', 'grow.campaigns.d': 'Planifica campañas, pruebas A/B y seguimiento de embudo.',
    'grow.myOutreach.l': 'Mi prospección', 'grow.myOutreach.d': 'Prospección escrita por IA para tu negocio — revisa y envía.',
    'grow.promote.l': 'Promocionar', 'grow.promote.d': 'Ejecuta campañas de promoción.',
    'grow.sales.l': 'Ventas', 'grow.sales.d': 'Resumen de ventas.',
    'grow.salesPipeline.l': 'Embudo de ventas', 'grow.salesPipeline.d': 'Negocios en curso.',
    'ws.dashboard.l': 'Panel', 'ws.dashboard.d': 'Tu base de operaciones.',
    'ws.assistant.l': 'Asistente', 'ws.assistant.d': 'Pregunta lo que sea al conserje.',
    'ws.calendar.l': 'Calendario', 'ws.calendar.d': 'Eventos y fechas culturales.',
    'ws.spreadsheets.l': 'Hojas de cálculo', 'ws.spreadsheets.d': 'Tus datos importados, en una cuadrícula.',
    'ws.feedback.l': 'Comentarios', 'ws.feedback.d': 'Envíanos tus comentarios.',
    'adm.mission.l': 'Control de misión', 'adm.mission.d': 'Cabina ejecutiva unificada de administración.', 'adm.overview.l': 'Resumen', 'adm.overview.d': 'Conteos reales de datos en vivo.',
    'adm.revenue.l': 'Ingresos', 'adm.revenue.d': 'MRR en vivo de suscripciones activas.',
    'adm.radar.l': 'Radar de oportunidades', 'adm.radar.d': 'Escaneo diario IA del mercado: competidores, brechas, alianzas.',
    'adm.data.l': 'Conectores de datos', 'adm.data.d': 'Importa y gestiona fuentes de datos conectadas.',
    'adm.metrics.l': 'Métricas y créditos', 'adm.metrics.d': 'Uso, créditos y métricas operativas.',
    'adm.console.l': 'Consola', 'adm.console.d': 'Utilidades de oficina y consola interna.',
    'adm.team.l': 'Equipo y roles', 'adm.team.d': 'Agrega personas y define accesos.',
    'adm.roles.l': 'Gestión de roles', 'adm.roles.d': 'Gestiona roles y propiedad.',
    'adm.onboarding.l': 'Incorporación', 'adm.onboarding.d': 'Controles de incorporación.',
    'adm.settings.l': 'Configuración de admin', 'adm.settings.d': 'Interruptores de todo el sistema.',
    'adm.opSettings.l': 'Configuración', 'adm.opSettings.d': 'Configuración operativa y preferencias de cuenta.',
    'help.faq.l': 'Preguntas frecuentes', 'help.contact.l': 'Contactar soporte', 'help.docs.l': 'Documentación',
  },
  pt: {
    'group.website': 'Site', 'group.podcast': 'Podcast', 'group.content': 'Conteúdo',
    'group.launchpad': 'Launchpad', 'group.grow': 'Crescer', 'group.workspace': 'Espaço de trabalho',
    'group.admin': 'Admin', 'group.help': 'Ajuda',
    'nav.home': 'Início', 'nav.dashboard': 'Painel', 'nav.pricing': 'Preços', 'nav.more': 'Mais',
    'plan.freeDemo': 'Demo grátis', 'plan.launch': 'Launch', 'plan.growth': 'Growth', 'plan.command': 'Command',
    'title.videoCredits': 'Créditos de vídeo disponíveis', 'title.currentPlan': 'Plano atual',
    'web.build.l': 'Criar um site', 'web.build.d': 'Gere um site completo a partir de um prompt.',
    'web.optimize.l': 'Otimizar site', 'web.optimize.d': 'Analise, otimize e reconstrua um site melhorado.',
    'web.reviews.l': 'Avaliações', 'web.reviews.d': 'Colete e exiba avaliações de clientes.',
    'web.improve.l': 'Melhorar conteúdo', 'web.improve.d': 'Aprimore páginas para SEO e conversão.',
    'pod.public.l': 'Para podcasters', 'pod.public.d': 'Página pública para criadores de podcasts.', 'pod.build.l': 'Criar um podcast', 'pod.build.d': 'Comece um podcast do zero.',
    'pod.optimize.l': 'Otimizar estúdio de podcast', 'pod.optimize.d': 'Audite seu feed para Apple, Spotify e crescimento.',
    'pod.hub.l': 'Central de podcast', 'pod.hub.d': 'Sua página e ferramentas de podcast.',
    'con.audio.l': 'Estúdio de áudio', 'con.audio.d': 'Voz e conteúdo de áudio nativos.',
    'con.video.l': 'Estúdio de vídeo', 'con.video.d': 'Gere vídeos, clipes, legendas e exportações.',
    'con.creative.l': 'Estúdio criativo', 'con.creative.d': 'Gere banners promocionais e visuais de campanha com IA.',
    'con.lab.l': 'Laboratório', 'con.lab.d': 'Ferramentas e recursos experimentais.',
    'con.apprentice.l': 'Aprendiz de oficina', 'con.apprentice.d': 'Ajuda guiada conforme seu nível.',
    'lp.home.l': 'Início do Launchpad', 'lp.home.d': 'Escolha um caminho de lançamento guiado.',
    'lp.business.l': 'Criar um negócio', 'lp.business.d': 'Lance um negócio do zero.',
    'lp.creator.l': 'Criador', 'lp.creator.d': 'Construa sua marca de criador.',
    'lp.store.l': 'Loja online', 'lp.store.d': 'Lance uma loja do zero.',
    'lp.podcast.l': 'Podcast', 'lp.podcast.d': 'Comece um podcast do zero.',
    'grow.hub.l': 'Central de prospecção', 'grow.hub.d': 'Sua central de comando de prospecção.',
    'grow.discovery.l': 'Descoberta', 'grow.discovery.d': 'Encontre e analise novos leads.',
    'grow.contacts.l': 'Contatos', 'grow.contacts.d': 'Revise e aprove leads.',
    'grow.pipeline.l': 'Funil', 'grow.pipeline.d': 'Acompanhe prospects por etapa.',
    'grow.campaigns.l': 'Campanhas', 'grow.campaigns.d': 'Planeje campanhas, testes A/B e acompanhamento de funil.',
    'grow.myOutreach.l': 'Minha prospecção', 'grow.myOutreach.d': 'Prospecção escrita por IA para o seu negócio — revise e envie.',
    'grow.promote.l': 'Promover', 'grow.promote.d': 'Realize campanhas de promoção.',
    'grow.sales.l': 'Vendas', 'grow.sales.d': 'Visão geral de vendas.',
    'grow.salesPipeline.l': 'Funil de vendas', 'grow.salesPipeline.d': 'Negócios em andamento.',
    'ws.dashboard.l': 'Painel', 'ws.dashboard.d': 'Sua base principal.',
    'ws.assistant.l': 'Assistente', 'ws.assistant.d': 'Pergunte qualquer coisa ao concierge.',
    'ws.calendar.l': 'Calendário', 'ws.calendar.d': 'Eventos e datas culturais.',
    'ws.spreadsheets.l': 'Planilhas', 'ws.spreadsheets.d': 'Seus dados importados, em uma grade.',
    'ws.feedback.l': 'Feedback', 'ws.feedback.d': 'Envie seu feedback.',
    'adm.mission.l': 'Controle de missão', 'adm.mission.d': 'Cockpit executivo unificado de administração.', 'adm.overview.l': 'Visão geral', 'adm.overview.d': 'Contagens reais de dados ao vivo.',
    'adm.revenue.l': 'Receita', 'adm.revenue.d': 'MRR ao vivo de assinaturas ativas.',
    'adm.radar.l': 'Radar de oportunidades', 'adm.radar.d': 'Varredura diária de mercado por IA: concorrentes, lacunas, parcerias.',
    'adm.data.l': 'Conectores de dados', 'adm.data.d': 'Importe e gerencie fontes de dados conectadas.',
    'adm.metrics.l': 'Métricas e créditos', 'adm.metrics.d': 'Uso, créditos e métricas operacionais.',
    'adm.console.l': 'Console', 'adm.console.d': 'Utilitários de escritório e console interno.',
    'adm.team.l': 'Equipe e funções', 'adm.team.d': 'Adicione pessoas e defina acessos.',
    'adm.roles.l': 'Gestão de funções', 'adm.roles.d': 'Gerencie funções e propriedade.',
    'adm.onboarding.l': 'Integração', 'adm.onboarding.d': 'Controles de integração.',
    'adm.settings.l': 'Configurações de admin', 'adm.settings.d': 'Controles de todo o sistema.',
    'adm.opSettings.l': 'Configurações', 'adm.opSettings.d': 'Configurações operacionais e preferências de conta.',
    'help.faq.l': 'Perguntas frequentes', 'help.contact.l': 'Falar com o suporte', 'help.docs.l': 'Documentação',
  },
  pl: {
    'group.website': 'Strona', 'group.podcast': 'Podcast', 'group.content': 'Treść',
    'group.launchpad': 'Launchpad', 'group.grow': 'Rozwój', 'group.workspace': 'Przestrzeń robocza',
    'group.admin': 'Admin', 'group.help': 'Pomoc',
    'nav.home': 'Strona główna', 'nav.dashboard': 'Panel', 'nav.pricing': 'Cennik', 'nav.more': 'Więcej',
    'plan.freeDemo': 'Darmowe demo', 'plan.launch': 'Launch', 'plan.growth': 'Growth', 'plan.command': 'Command',
    'title.videoCredits': 'Dostępne kredyty wideo', 'title.currentPlan': 'Bieżący plan',
    'web.build.l': 'Stwórz stronę', 'web.build.d': 'Wygeneruj całą stronę z polecenia.',
    'web.optimize.l': 'Optymalizuj stronę', 'web.optimize.d': 'Analizuj, optymalizuj i przebuduj ulepszoną stronę.',
    'web.reviews.l': 'Opinie', 'web.reviews.d': 'Zbieraj i prezentuj opinie klientów.',
    'web.improve.l': 'Ulepsz treść', 'web.improve.d': 'Dopracuj strony pod SEO i konwersję.',
    'pod.public.l': 'Dla podcasterów', 'pod.public.d': 'Publiczna strona dla twórców podcastów.', 'pod.build.l': 'Stwórz podcast', 'pod.build.d': 'Załóż podcast od zera.',
    'pod.optimize.l': 'Optymalizuj studio podcastu', 'pod.optimize.d': 'Sprawdź swój kanał pod Apple, Spotify i rozwój.',
    'pod.hub.l': 'Centrum podcastu', 'pod.hub.d': 'Twoja strona i narzędzia podcastu.',
    'con.audio.l': 'Studio audio', 'con.audio.d': 'Natywny głos i treści audio.',
    'con.video.l': 'Studio wideo', 'con.video.d': 'Twórz filmy, klipy, napisy i eksporty.',
    'con.creative.l': 'Studio kreatywne', 'con.creative.d': 'Generuj banery promocyjne i wizualizacje kampanii dzięki AI.',
    'con.lab.l': 'Laboratorium', 'con.lab.d': 'Eksperymentalne narzędzia i funkcje.',
    'con.apprentice.l': 'Asystent warsztatu', 'con.apprentice.d': 'Pomoc dopasowana do poziomu.',
    'lp.home.l': 'Launchpad — start', 'lp.home.d': 'Wybierz prowadzoną ścieżkę startu.',
    'lp.business.l': 'Zbuduj firmę', 'lp.business.d': 'Uruchom firmę od zera.',
    'lp.creator.l': 'Twórca', 'lp.creator.d': 'Zbuduj swoją markę twórcy.',
    'lp.store.l': 'Sklep internetowy', 'lp.store.d': 'Uruchom sklep od zera.',
    'lp.podcast.l': 'Podcast', 'lp.podcast.d': 'Załóż podcast od zera.',
    'grow.hub.l': 'Centrum kontaktów', 'grow.hub.d': 'Twoje centrum dowodzenia kontaktami.',
    'grow.discovery.l': 'Odkrywanie', 'grow.discovery.d': 'Znajduj i analizuj nowych klientów.',
    'grow.contacts.l': 'Kontakty', 'grow.contacts.d': 'Przeglądaj i zatwierdzaj klientów.',
    'grow.pipeline.l': 'Lejek', 'grow.pipeline.d': 'Śledź klientów według etapu.',
    'grow.campaigns.l': 'Kampanie', 'grow.campaigns.d': 'Planuj kampanie, testy A/B i śledzenie lejka.',
    'grow.myOutreach.l': 'Mój outreach', 'grow.myOutreach.d': 'Outreach pisany przez AI dla Twojej firmy — sprawdź i wyślij.',
    'grow.promote.l': 'Promuj', 'grow.promote.d': 'Prowadź kampanie promocyjne.',
    'grow.sales.l': 'Sprzedaż', 'grow.sales.d': 'Przegląd sprzedaży.',
    'grow.salesPipeline.l': 'Lejek sprzedaży', 'grow.salesPipeline.d': 'Transakcje w toku.',
    'ws.dashboard.l': 'Panel', 'ws.dashboard.d': 'Twoja baza główna.',
    'ws.assistant.l': 'Asystent', 'ws.assistant.d': "Zapytaj concierge'a o cokolwiek.",
    'ws.calendar.l': 'Kalendarz', 'ws.calendar.d': 'Wydarzenia i daty kulturalne.',
    'ws.spreadsheets.l': 'Arkusze', 'ws.spreadsheets.d': 'Twoje zaimportowane dane w tabeli.',
    'ws.feedback.l': 'Opinie', 'ws.feedback.d': 'Wyślij nam swoją opinię.',
    'adm.mission.l': 'Centrum dowodzenia', 'adm.mission.d': 'Zunifikowany kokpit administracyjny.', 'adm.overview.l': 'Przegląd', 'adm.overview.d': 'Rzeczywiste dane na żywo.',
    'adm.revenue.l': 'Przychód', 'adm.revenue.d': 'Bieżący MRR z aktywnych subskrypcji.',
    'adm.radar.l': 'Radar okazji', 'adm.radar.d': 'Codzienny skan rynku AI: konkurencja, luki, partnerstwa.',
    'adm.data.l': 'Łączniki danych', 'adm.data.d': 'Importuj i zarządzaj połączonymi źródłami danych.',
    'adm.metrics.l': 'Metryki i kredyty', 'adm.metrics.d': 'Zużycie, kredyty i metryki operacyjne.',
    'adm.console.l': 'Konsola', 'adm.console.d': 'Narzędzia biurowe i konsola wewnętrzna.',
    'adm.team.l': 'Zespół i role', 'adm.team.d': 'Dodawaj osoby i ustaw dostęp.',
    'adm.roles.l': 'Zarządzanie rolami', 'adm.roles.d': 'Zarządzaj rolami i własnością.',
    'adm.onboarding.l': 'Wdrożenie', 'adm.onboarding.d': 'Ustawienia wdrożenia.',
    'adm.settings.l': 'Ustawienia admina', 'adm.settings.d': 'Przełączniki systemowe.',
    'adm.opSettings.l': 'Ustawienia', 'adm.opSettings.d': 'Ustawienia operacyjne i preferencje konta.',
    'help.faq.l': 'FAQ', 'help.contact.l': 'Kontakt z pomocą', 'help.docs.l': 'Dokumentacja',
  },
  ru: {
    'group.website': 'Сайт', 'group.podcast': 'Подкаст', 'group.content': 'Контент',
    'group.launchpad': 'Launchpad', 'group.grow': 'Рост', 'group.workspace': 'Рабочая область',
    'group.admin': 'Админ', 'group.help': 'Помощь',
    'nav.home': 'Главная', 'nav.dashboard': 'Панель', 'nav.pricing': 'Цены', 'nav.more': 'Ещё',
    'plan.freeDemo': 'Бесплатное демо', 'plan.launch': 'Launch', 'plan.growth': 'Growth', 'plan.command': 'Command',
    'title.videoCredits': 'Доступные видеокредиты', 'title.currentPlan': 'Текущий план',
    'web.build.l': 'Создать сайт', 'web.build.d': 'Создайте полный сайт из запроса.',
    'web.optimize.l': 'Оптимизировать сайт', 'web.optimize.d': 'Анализируйте, оптимизируйте и пересоберите улучшенный сайт.',
    'web.reviews.l': 'Отзывы', 'web.reviews.d': 'Собирайте и показывайте отзывы клиентов.',
    'web.improve.l': 'Улучшить контент', 'web.improve.d': 'Доработайте страницы для SEO и конверсии.',
    'pod.public.l': 'Для подкастеров', 'pod.public.d': 'Публичная страница для авторов подкастов.', 'pod.build.l': 'Создать подкаст', 'pod.build.d': 'Создайте подкаст с нуля.',
    'pod.optimize.l': 'Оптимизировать студию подкаста', 'pod.optimize.d': 'Проверьте свой фид для Apple, Spotify и роста.',
    'pod.hub.l': 'Центр подкаста', 'pod.hub.d': 'Ваша страница и инструменты подкаста.',
    'con.audio.l': 'Аудиостудия', 'con.audio.d': 'Естественный голос и аудиоконтент.',
    'con.video.l': 'Видеостудия', 'con.video.d': 'Создавайте видео, клипы, субтитры и экспорты.',
    'con.creative.l': 'Креативная студия', 'con.creative.d': 'Создавайте промо-баннеры и визуалы кампаний с помощью ИИ.',
    'con.lab.l': 'Лаборатория', 'con.lab.d': 'Экспериментальные инструменты и функции.',
    'con.apprentice.l': 'Помощник мастерской', 'con.apprentice.d': 'Пошаговая помощь с учётом уровня.',
    'lp.home.l': 'Главная Launchpad', 'lp.home.d': 'Выберите управляемый путь запуска.',
    'lp.business.l': 'Создать бизнес', 'lp.business.d': 'Запустите бизнес с нуля.',
    'lp.creator.l': 'Автор', 'lp.creator.d': 'Создайте свой бренд автора.',
    'lp.store.l': 'Интернет-магазин', 'lp.store.d': 'Запустите магазин с нуля.',
    'lp.podcast.l': 'Подкаст', 'lp.podcast.d': 'Создайте подкаст с нуля.',
    'grow.hub.l': 'Центр аутрича', 'grow.hub.d': 'Ваш командный центр аутрича.',
    'grow.discovery.l': 'Поиск', 'grow.discovery.d': 'Находите и анализируйте новых лидов.',
    'grow.contacts.l': 'Контакты', 'grow.contacts.d': 'Просматривайте и одобряйте лидов.',
    'grow.pipeline.l': 'Воронка', 'grow.pipeline.d': 'Отслеживайте лидов по этапам.',
    'grow.campaigns.l': 'Кампании', 'grow.campaigns.d': 'Планируйте кампании, A/B-тесты и отслеживание воронки.',
    'grow.myOutreach.l': 'Мой аутрич', 'grow.myOutreach.d': 'Аутрич от ИИ для вашего бизнеса — проверьте и отправьте.',
    'grow.promote.l': 'Продвигать', 'grow.promote.d': 'Запускайте промо-кампании.',
    'grow.sales.l': 'Продажи', 'grow.sales.d': 'Обзор продаж.',
    'grow.salesPipeline.l': 'Воронка продаж', 'grow.salesPipeline.d': 'Сделки в процессе.',
    'ws.dashboard.l': 'Панель', 'ws.dashboard.d': 'Ваша домашняя база.',
    'ws.assistant.l': 'Ассистент', 'ws.assistant.d': 'Спросите консьержа о чём угодно.',
    'ws.calendar.l': 'Календарь', 'ws.calendar.d': 'События и культурные даты.',
    'ws.spreadsheets.l': 'Таблицы', 'ws.spreadsheets.d': 'Ваши импортированные данные в таблице.',
    'ws.feedback.l': 'Отзывы', 'ws.feedback.d': 'Отправьте нам свой отзыв.',
    'adm.mission.l': 'Центр управления', 'adm.mission.d': 'Единый административный кокпит.', 'adm.overview.l': 'Обзор', 'adm.overview.d': 'Реальные данные в реальном времени.',
    'adm.revenue.l': 'Доход', 'adm.revenue.d': 'Текущий MRR от активных подписок.',
    'adm.radar.l': 'Радар возможностей', 'adm.radar.d': 'Ежедневный ИИ-скан рынка: конкуренты, ниши, партнёрства.',
    'adm.data.l': 'Коннекторы данных', 'adm.data.d': 'Импортируйте и управляйте подключёнными источниками данных.',
    'adm.metrics.l': 'Метрики и кредиты', 'adm.metrics.d': 'Использование, кредиты и операционные метрики.',
    'adm.console.l': 'Консоль', 'adm.console.d': 'Офисные утилиты и внутренняя консоль.',
    'adm.team.l': 'Команда и роли', 'adm.team.d': 'Добавляйте людей и настраивайте доступ.',
    'adm.roles.l': 'Управление ролями', 'adm.roles.d': 'Управляйте ролями и владением.',
    'adm.onboarding.l': 'Онбординг', 'adm.onboarding.d': 'Настройки онбординга.',
    'adm.settings.l': 'Настройки админа', 'adm.settings.d': 'Системные переключатели.',
    'adm.opSettings.l': 'Настройки', 'adm.opSettings.d': 'Операционные настройки и параметры аккаунта.',
    'help.faq.l': 'Частые вопросы', 'help.contact.l': 'Связаться с поддержкой', 'help.docs.l': 'Документация',
  },
}

function tr(lang: string, key: string): string {
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
  return COPY[l]?.[key] ?? COPY.en[key] ?? ''
}

function localize(items: Item[], lang: string): LocalizedItem[] {
  return items.map(it => {
    const label = tr(lang, `${it.key}.l`)
    const dKey = `${it.key}.d`
    const desc = dKey in COPY.en ? tr(lang, dKey) : undefined
    return { icon: it.icon, href: it.href, label, ...(desc ? { desc } : {}) }
  })
}

const PLAN_KEY: Record<string, string> = {
  free: 'plan.freeDemo', demo: 'plan.freeDemo',
  starter: 'plan.launch', launch: 'plan.launch',
  pro: 'plan.growth', growth: 'plan.growth',
  business: 'plan.command', command: 'plan.command',
}

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)' },
  demo: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)' },
  starter: { bg: 'rgba(59,130,246,0.18)', color: '#7ab8ff' },
  launch: { bg: 'rgba(59,130,246,0.18)', color: '#7ab8ff' },
  pro: { bg: 'rgba(255,195,0,0.18)', color: '#ffc300' },
  growth: { bg: 'rgba(255,195,0,0.18)', color: '#ffc300' },
  business: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80' },
  command: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80' },
}

function publicPlanLabel(plan: string, lang: string) {
  const safe = String(plan || 'free').toLowerCase()
  const key = PLAN_KEY[safe]
  if (key) return tr(lang, key)
  return safe.charAt(0).toUpperCase() + safe.slice(1)
}

function publicPlanStyle(plan: string) {
  const safe = String(plan || 'free').toLowerCase()
  return PLAN_STYLES[safe] || PLAN_STYLES.free
}
export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pathname = usePathname()
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number>(0)
  const [plan, setPlan] = useState<string>('free')
  const [userName, setUserName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Localized menu groups (recomputed when language changes)
  const dashboardItems = localize(DASHBOARD_MENU, lang)
  const websiteItems   = localize(WEBSITE, lang)
  const podcastItems   = localize(PODCAST, lang)
  const contentItems   = localize(CONTENT, lang)
  const launchpadItems = localize(LAUNCHPAD, lang)
  const growItems      = localize(GROW, lang)
  const workspaceItems = localize(WORKSPACE, lang)
  const adminItems     = localize(ADMIN, lang)
  const helpItems      = localize(HELP, lang)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        fetchCredits()
      } else {
        setIsAdmin(false)
        setIsOwner(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        fetchCredits()
      } else {
        setIsAdmin(false)
        setIsOwner(false)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function fetchCredits() {
    try {
      const res = await fetch('/api/credits', { cache: 'no-store' })
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (data.plan) setPlan(data.plan)
      if (data.name) setUserName(data.name)
      setIsAdmin(!!data.isAdmin)
      setIsOwner(!!data.isOwner)
    } catch {
      // Navbar should not break the app if credits fail.
    }
  }

  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = 40
    const height = 40
    const centerX = width / 2
    const centerY = height - 8

    canvas.width = width
    canvas.height = height

    let rings: { r: number; alpha: number }[] = []
    let last = 0
    let raf = 0

    function draw(timestamp: number) {
      ctx.clearRect(0, 0, width, height)
      if (!last || timestamp - last > 2000) {
        rings.push({ r: 0, alpha: 1 })
        last = timestamp
      }
      rings = rings.filter((ring) => ring.alpha > 0.01)
      for (const ring of rings) {
        ring.r += 0.8
        ring.alpha -= 0.012
        ctx.globalAlpha = Math.max(0, ring.alpha)
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(centerX, centerY, ring.r, Math.PI, 0)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function openNow(id: string) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpenMenu(id)
  }

  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpenMenu(null)
    }, 140)
  }

  const groupActive = (items: LocalizedItem[]) =>
    items.some((item) => item.href !== '/' && (pathname === item.href || pathname?.startsWith(`${item.href}/`)))

  const trigger = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 600,
    fontSize: 13,
    fontFamily: 'inherit',
    padding: '8px 2px',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  })

  const panelWrap = (open: boolean, align: 'left' | 'right'): CSSProperties => ({
    position: 'absolute',
    top: '100%',
    [align]: 0,
    paddingTop: 12,
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0)' : 'translateY(8px)',
    visibility: open ? 'visible' : 'hidden',
    pointerEvents: open ? 'auto' : 'none',
    transition: 'opacity .18s ease, transform .18s ease, visibility .18s',
    zIndex: 200,
  })

  const panelCard: CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(135deg, rgba(20,24,36,.98), rgba(15,23,42,.98))',
    border: '1px solid var(--border-medium)',
    borderRadius: 18,
    boxShadow: '0 30px 80px rgba(0,0,0,.55)',
    overflow: 'hidden',
    backdropFilter: 'blur(14px)',
  }

  const accentLine: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: `linear-gradient(90deg, ${GOLD}, ${CYAN})`,
  }

  const planStyle = publicPlanStyle(plan)
  const planLabel = publicPlanLabel(plan, lang)
  const displayName = userName || user?.email || ''

  const MENU_ACCENTS: Record<string, string> = {
    dashboard: '#ffc300',
    website:   '#1af0ff',
    podcast:   '#a78bfa',
    content:   '#f472b6',
    launchpad: '#fb923c',
    grow:      '#4ade80',
    workspace: '#60a5fa',
    admin:     '#f87171',
    help:      '#94a3b8',
  }

  function Group({
    id,
    label,
    items,
    align = 'left',
    cols = 1,
    width = 320,
  }: {
    id: string
    label: string
    items: LocalizedItem[]
    align?: 'left' | 'right'
    cols?: number
    width?: number
  }) {
    const open = openMenu === id
    const accent = MENU_ACCENTS[id] || 'rgba(255,255,255,.6)'
    const lit = open || groupActive(items)

    return (
      <div style={{ position: 'relative' }} onMouseEnter={() => openNow(id)} onMouseLeave={closeSoon}>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpenMenu(open ? null : id)}
          style={{ ...trigger(lit), ...(lit ? { color: accent } : {}) }}
        >
          <span aria-hidden="true" style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 999, background: accent, marginRight: 5, opacity: lit ? 1 : .65, boxShadow: lit ? `0 0 8px ${accent}` : 'none' }} />
          {label}
          <span
            style={{
              fontSize: 10,
              opacity: 0.7,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform .18s',
            }}
          >
            ▾
          </span>
        </button>

        <div style={panelWrap(open, align)} onMouseEnter={() => openNow(id)} onMouseLeave={closeSoon}>
          <div style={panelCard}>
            <span style={accentLine} aria-hidden="true" />
            <div
              style={{
                padding: 12,
                width,
                maxWidth: '92vw',
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 2,
              }}
            >
              {items.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setOpenMenu(null)}
                  className="sbnav-row"
                  style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                      {item.label}
                    </span>
                    {item.desc ? (
                      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 1, lineHeight: 1.35 }}>
                        {item.desc}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .sbnav-desktop { display: flex; align-items: center; gap: 10px; }
        .sbnav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .sbnav-burger { display: none; }
        .sbnav-mobile-auth { display: none; }
        .sbnav-row { transition: background .15s ease; border-radius: 12px; }
        .sbnav-row:hover { background: var(--surface-1-hover); }
        @media (max-width: 1200px) {
          .sbnav-desktop, .sbnav-right { display: none !important; }
          .sbnav-burger { display: inline-flex !important; }
          .sbnav-mobile-auth { display: inline-flex !important; }
        }
      `}</style>

      <nav
        ref={navRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'linear-gradient(135deg, rgba(8,10,20,.86), rgba(15,23,42,.62))',
          borderBottom: '1px solid rgba(26,240,255,.16)',
          boxShadow: '0 18px 60px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(12px)',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0, marginRight: 14 }}>
          <canvas ref={canvasRef} style={{ width: 40, height: 40 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>

        <div className="sbnav-desktop">
          <Link href="/" style={{ ...trigger(pathname === '/'), display: 'inline-flex' }}>
            {tr(lang, 'nav.home')}
          </Link>

          {user ? (
            <Group id="dashboard" label={tr(lang, 'nav.dashboard')} items={dashboardItems} width={340} />
          ) : null}

          <Group id="website"   label={tr(lang, 'group.website')}   items={websiteItems}   width={340} />
          <Group id="podcast"   label={tr(lang, 'group.podcast')}   items={podcastItems}   width={340} />
          <Group id="content"   label={tr(lang, 'group.content')}   items={contentItems}   width={340} />
          <Group id="launchpad" label={tr(lang, 'group.launchpad')} items={launchpadItems} width={340} />
          <Group id="grow"      label={tr(lang, 'group.grow')}      items={growItems}      width={340} />
          <Group id="workspace" label={tr(lang, 'group.workspace')} items={workspaceItems} width={340} />

          {isAdmin ? <Group id="admin" label={tr(lang, 'group.admin')} items={adminItems} width={360} /> : null}

          <Link href="/pricing" style={{ ...trigger(pathname === '/pricing'), display: 'inline-flex' }}>
            {tr(lang, 'nav.pricing')}
          </Link>

          <Group id="help" label={tr(lang, 'group.help')} items={helpItems} align="right" width={240} />
        </div>

        <div className="sbnav-right">
          <select
            value={lang}
            onChange={(event) => setLang(event.target.value)}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 999,
              padding: '8px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>

          {user ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                title={`${tr(lang, 'title.videoCredits')}: ${credits.toLocaleString()}`}
                style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                ⚡{credits >= 100000 ? `${Math.floor(credits / 1000)}K` : credits.toLocaleString()}
              </span>
              <span
                title={`${tr(lang, 'title.currentPlan')}: ${planLabel}`}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: planStyle.bg,
                  color: planStyle.color,
                  fontFamily: 'monospace',
                }}
              >
                {planLabel}
              </span>
              {displayName ? (
                <span
                  title={displayName}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    maxWidth: 130,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayName}
                </span>
              ) : null}
            </span>
          ) : null}

          {user ? (
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-soft)',
                borderRadius: 999,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              {t(dict, 'logout', 'Log out')}
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              style={{
                background: GOLD,
                color: '#000',
                border: 'none',
                borderRadius: 999,
                padding: '9px 22px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </div>

        <span className="sbnav-mobile-auth" style={{ alignItems: 'center', gap: 8 }}>
          {user ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>
                ⚡ {credits}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: planStyle.bg,
                  color: planStyle.color,
                  fontFamily: 'monospace',
                }}
              >
                {planLabel}
              </span>
            </>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              style={{
                background: GOLD,
                color: '#000',
                border: 'none',
                borderRadius: 999,
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </span>

        <button
          className="sbnav-burger"
          aria-label="Menu"
          onClick={() => setMobileOpen((open) => !open)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-soft)',
            borderRadius: 10,
            color: '#fff',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </nav>

      {mobileOpen ? (
        <div
          style={{
            position: 'sticky',
            top: 65,
            zIndex: 99,
            background: 'rgba(8,10,20,.98)',
            borderBottom: '1px solid var(--border-medium)',
            padding: 16,
            maxHeight: '80vh',
            overflowY: 'auto',
            backdropFilter: 'blur(12px)',
          }}
        >
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>
                ⚡ {credits}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: planStyle.bg,
                  color: planStyle.color,
                  fontFamily: 'monospace',
                }}
              >
                {planLabel}
              </span>
              {displayName ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {displayName}
                </span>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-soft)' }}>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value)}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 999,
                padding: '8px 12px',
                fontSize: 12,
              }}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>

            {user ? (
              <button
                onClick={handleLogout}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 999,
                  padding: '9px 16px',
                  cursor: 'pointer',
                }}
              >
                {t(dict, 'logout', 'Log out')}
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileOpen(false)
                  setShowAuth(true)
                }}
                style={{
                  background: GOLD,
                  color: '#000',
                  border: 'none',
                  borderRadius: 999,
                  padding: '9px 22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {t(dict, 'getStarted', 'Get started')}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <Link href="/" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 700, fontSize: 14 }}>
              🏠 {tr(lang, 'nav.home')}
            </Link>
          </div>

          {[
            { title: tr(lang, 'group.website'),   items: websiteItems },
            { title: tr(lang, 'group.podcast'),   items: podcastItems },
            { title: tr(lang, 'group.content'),   items: contentItems },
            { title: tr(lang, 'group.launchpad'), items: launchpadItems },
            { title: tr(lang, 'group.grow'),      items: growItems },
            { title: tr(lang, 'group.workspace'), items: workspaceItems },
            ...(isAdmin ? [{ title: tr(lang, 'group.admin'), items: adminItems }] : []),
          ].map((section) => (
            <div key={section.title} style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {section.title}
              </span>
              {section.items.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {tr(lang, 'nav.more')}
            </span>
            <Link href="/pricing" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
              {tr(lang, 'nav.pricing')}
            </Link>
            {helpItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
    </>
  )
}
