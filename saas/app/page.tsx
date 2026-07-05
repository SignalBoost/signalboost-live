'use client'

import Link from 'next/link'
import SignalHero from '@/components/SignalHero'
import FeaturesFlow from '@/components/FeaturesFlow'
import Testimonials from '@/components/Testimonials'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES } from '@/lib/services/catalog'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'

const AGENCY_COPY: Record<string, { label: string; kicker: string; title: string; text: string; cta: string }> = {
  en: { label: 'SignalBoost Omnichannel Agency Engine', kicker: 'Hero product', title: 'Plan global campaigns with a pre-funded safety gate.', text: 'Create localized assets, estimate the campaign budget, and prepare managed publishing packages before any paid media or broker action is released.', cta: 'Open Agency Engine' },
  pt: { label: 'Motor de Agência Omnichannel SignalBoost', kicker: 'Produto principal', title: 'Planeje campanhas globais com uma trava pré-financiada.', text: 'Crie ativos localizados, estime o orçamento da campanha e prepare pacotes de publicação gerenciada antes de qualquer mídia paga ou ação de broker ser liberada.', cta: 'Abrir Agency Engine' },
  es: { label: 'Motor de Agencia Omnicanal SignalBoost', kicker: 'Producto principal', title: 'Planifica campañas globales con una compuerta prefinanciada.', text: 'Crea activos localizados, estima el presupuesto y prepara paquetes de publicación gestionada antes de liberar medios pagados o brokers.', cta: 'Abrir Agency Engine' },
  pl: { label: 'Silnik Agencji Omnichannel SignalBoost', kicker: 'Produkt główny', title: 'Planuj globalne kampanie z przedpłaconą bramką bezpieczeństwa.', text: 'Twórz lokalizowane materiały, szacuj budżet i przygotuj pakiety publikacji zarządzanej przed odblokowaniem płatnych mediów lub brokerów.', cta: 'Otwórz Agency Engine' },
  ru: { label: 'Омниканальный агентский движок SignalBoost', kicker: 'Главный продукт', title: 'Планируйте глобальные кампании через предоплаченную защитную точку.', text: 'Создавайте локализованные материалы, оценивайте бюджет и готовьте managed publishing пакеты до разблокировки платных медиа или брокеров.', cta: 'Открыть Agency Engine' },
}

const OPTIMIZER_COPY: Record<string, { label: string; kicker: string; title: string; text: string; cta: string }> = {
  en: { label: 'Free website optimization test', kicker: 'Free business utility', title: 'Test your website optimization for free.', text: 'Paste a public website URL and get a quick preview of speed, SEO, accessibility, security, and conversion opportunities. Then SignalBoost can help prepare the fix plan.', cta: 'Run website test' },
  pt: { label: 'Teste gratuito de otimização de site', kicker: 'Utilitário gratuito para negócios', title: 'Teste a otimização do seu site gratuitamente.', text: 'Cole uma URL pública de site e receba uma prévia rápida de velocidade, SEO, acessibilidade, segurança e oportunidades de conversão. Depois o SignalBoost pode ajudar a preparar o plano de correção.', cta: 'Executar teste do site' },
  es: { label: 'Prueba gratuita de optimización web', kicker: 'Utilidad gratuita para negocios', title: 'Prueba gratis la optimización de tu sitio web.', text: 'Pega una URL pública de sitio web y recibe una vista previa rápida de velocidad, SEO, accesibilidad, seguridad y oportunidades de conversión. Luego SignalBoost puede ayudar a preparar el plan de corrección.', cta: 'Ejecutar prueba del sitio' },
  pl: { label: 'Darmowy test optymalizacji strony', kicker: 'Darmowe narzędzie biznesowe', title: 'Sprawdź za darmo optymalizację swojej strony.', text: 'Wklej publiczny URL strony i otrzymaj szybki podgląd szybkości, SEO, dostępności, bezpieczeństwa i możliwości konwersji. Następnie SignalBoost może pomóc przygotować plan poprawek.', cta: 'Uruchom test strony' },
  ru: { label: 'Бесплатная проверка оптимизации сайта', kicker: 'Бесплатный бизнес-инструмент', title: 'Бесплатно проверьте оптимизацию своего сайта.', text: 'Вставьте публичный URL сайта и получите быстрый обзор скорости, SEO, доступности, безопасности и возможностей конверсии. Затем SignalBoost может помочь подготовить план исправлений.', cta: 'Запустить тест сайта' },
}

const CYBER_COPY: Record<string, { label: string; kicker: string; title: string; text: string; cta: string }> = {
  en: { label: 'Free cybersecurity preview', kicker: 'Free security utility', title: 'Check public website security signals.', text: 'Review HTTPS, security headers, cookie flags, mixed-content signals, and public exposure indicators without private access or intrusive testing.', cta: 'Run security preview' },
  pt: { label: 'Prévia gratuita de cibersegurança', kicker: 'Utilitário gratuito de segurança', title: 'Verifique sinais públicos de segurança do site.', text: 'Revise HTTPS, cabeçalhos de segurança, flags de cookies, conteúdo misto e indicadores públicos de exposição sem acesso privado ou teste intrusivo.', cta: 'Executar prévia de segurança' },
  es: { label: 'Vista previa gratuita de ciberseguridad', kicker: 'Utilidad gratuita de seguridad', title: 'Revisa señales públicas de seguridad web.', text: 'Revisa HTTPS, cabeceras de seguridad, cookies, contenido mixto e indicadores públicos de exposición sin acceso privado ni pruebas intrusivas.', cta: 'Ejecutar vista de seguridad' },
  pl: { label: 'Darmowy podgląd cyberbezpieczeństwa', kicker: 'Darmowe narzędzie bezpieczeństwa', title: 'Sprawdź publiczne sygnały bezpieczeństwa strony.', text: 'Sprawdź HTTPS, nagłówki bezpieczeństwa, flagi cookies, mixed content i publiczne sygnały ekspozycji bez prywatnego dostępu lub testów intruzyjnych.', cta: 'Uruchom podgląd bezpieczeństwa' },
  ru: { label: 'Бесплатный обзор кибербезопасности', kicker: 'Бесплатный инструмент безопасности', title: 'Проверьте публичные сигналы безопасности сайта.', text: 'Проверьте HTTPS, security headers, cookie flags, mixed content и публичные сигналы экспозиции без приватного доступа или интрузивного тестирования.', cta: 'Запустить обзор безопасности' },
}

export default function Home() {
  const { dict, lang } = useI18n()
  const agencyCopy = AGENCY_COPY[lang] || AGENCY_COPY.en
  const optimizerCopy = OPTIMIZER_COPY[lang] || OPTIMIZER_COPY.en
  const cyberCopy = CYBER_COPY[lang] || CYBER_COPY.en
  const featureCards = [1, 2, 3].map((item) => ({
    icon: ['🧠', '🌐', '⚡'][item - 1],
    title: t(dict, `home.features.${item}.title`, ['AI proposes the next move', 'One brand, every channel', 'Built for action'][item - 1]),
    text: t(dict, `home.features.${item}.text`, ['Guided suggestions appear before a user types, reducing blank-page friction.', 'Websites, reviews, audio, video, optimization, lab, and outreach share the same visual rhythm.', 'Each service highlights one primary CTA so teams know exactly what to do next.'][item - 1]),
  }))

  return (
    <main>
      <SignalHero />

      <section className="sb-page-shell sb-section" aria-label={agencyCopy.label}>
        <div className="sb-glass" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 22, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{agencyCopy.kicker}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{agencyCopy.title}</h2>
            <p className="sb-body" style={{ maxWidth: 720 }}>{agencyCopy.text}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/agency">{agencyCopy.cta}</Link>
            <Link className="sb-button-secondary" href="/agency#agency-pricing">{t(dict, 'home.comparePlans', 'Compare plans')}</Link>
          </div>
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.repoCheckLabel', 'Free public repo check')}>
        <div className="sb-glass" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 22, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.repoCheckKicker', 'Free developer utility')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.repoCheckTitle', 'Run a free public GitHub repo check.')}</h2>
            <p className="sb-body" style={{ maxWidth: 720 }}>{t(dict, 'home.repoCheckText', 'Paste a public repository URL and get a capped package advisory preview. Audit Pro unlocks the complete report, planning layer, scheduled monitoring, and assisted review workflow.')}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/repo-check">{t(dict, 'home.repoCheckCta', 'Run free repo check')}</Link>
            <Link className="sb-button-secondary" href="/pricing">{t(dict, 'home.repoCheckPricing', 'View Audit Pro')}</Link>
          </div>
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={optimizerCopy.label}>
        <div className="sb-glass" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 22, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{optimizerCopy.kicker}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{optimizerCopy.title}</h2>
            <p className="sb-body" style={{ maxWidth: 720 }}>{optimizerCopy.text}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/website-optimizer">{optimizerCopy.cta}</Link>
            <Link className="sb-button-secondary" href="/support">SignalBoost</Link>
          </div>
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={cyberCopy.label}>
        <div className="sb-glass" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 22, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{cyberCopy.kicker}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{cyberCopy.title}</h2>
            <p className="sb-body" style={{ maxWidth: 720 }}>{cyberCopy.text}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/cybersecurity-check">{cyberCopy.cta}</Link>
            <Link className="sb-button-secondary" href="/support">SignalBoost</Link>
          </div>
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.featuresLabel', 'Features')}>
        <div className="sb-cta-row" style={{ justifyContent: 'space-between', alignItems: 'end', marginBottom: 24 }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.featuresKicker', 'Features')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.featuresTitle', 'Everything arranged around momentum.')}</h2>
          </div>
          <Link className="sb-button-secondary" href="/docs">{t(dict, 'home.workflowCta', 'Show me the workflow')}</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {featureCards.map(({ icon, title, text }) => (
            <article key={title} className="sb-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{icon}</div>
              <h3 className="sb-h3">{title}</h3>
              <p className="sb-body" style={{ fontSize: 14, marginBottom: 0 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.servicesLabel', 'Services')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'end', marginBottom: 22 }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.servicesKicker', 'All services')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.servicesTitle', 'Nine connected services for launch, content, optimization, and learning.')}</h2>
          </div>
          <Link className="sb-button-primary" href="/dashboard">{t(dict, 'home.openWorkspace', 'Open workspace')}</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {SERVICES.map((service) => (
            <Link key={service.key} href={service.landingHref} className="sb-card" style={{ padding: 22, textDecoration: 'none', color: '#fff', borderColor: `${service.accent}44` }}>
              <div style={{ fontSize: 30 }}>{service.icon}</div>
              <h3 className="sb-h3">{t(dict, `services.${service.key}.title`, service.titleFallback)}</h3>
              <p className="sb-body" style={{ fontSize: 14 }}>{t(dict, `services.${service.key}.desc`, service.descFallback)}</p>
              <span className="sb-caption">{t(dict, `services.${service.key}.cta`, service.ctaFallback)} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'orchestration.kicker', 'AI orchestration')}>
        <OrchestrationPanel module="homepage" />
      </section>

      <FeaturesFlow />
      <Testimonials />

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.ctaLabel', 'Call to action')}>
        <div className="sb-glass" style={{ padding: 32, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.readyKicker', 'Ready when you are')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.readyTitle', 'Let SignalBoost organize your growth room.')}</h2>
            <p className="sb-body" style={{ maxWidth: 680 }}>{t(dict, 'home.readyText', 'Start with one campaign or optimization. The AI will suggest an audience, tone, proof point, approval step, and launch-ready result before you publish.')}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/dashboard">{t(dict, 'home.startBuilding', 'Start building')}</Link>
            <Link className="sb-button-secondary" href="/pricing">{t(dict, 'home.comparePlans', 'Compare plans')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
