'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:   { en: 'Documentation', es: 'Documentación', pt: 'Documentação', pl: 'Dokumentacja', ru: 'Документация' },
  title:     { en: 'A clear map for building with SignalBoost.', es: 'Un mapa claro para construir con SignalBoost.', pt: 'Um mapa claro para construir com SignalBoost.', pl: 'Przejrzysta mapa do budowania z SignalBoost.', ru: 'Чёткая карта для создания с SignalBoost.' },
  subtitle:  { en: 'Docs are organized by how a human thinks through work: choose an intent, follow AI guidance, review the output, and approve the final action.', es: 'Los docs están organizados por cómo una persona piensa el trabajo: elige una intención, sigue la guía IA, revisa el resultado y aprueba la acción final.', pt: 'Os docs estão organizados por como uma pessoa pensa o trabalho: escolha uma intenção, siga a orientação IA, revise o resultado e aprove a ação final.', pl: 'Dokumenty są zorganizowane według sposobu myślenia człowieka: wybierz intencję, śledź wskazówki AI, sprawdź wynik i zatwierdź końcowe działanie.', ru: 'Документы организованы так, как человек думает о работе: выберите намерение, следуйте руководству ИИ, проверьте результат и одобрите финальное действие.' },
  scanPath:  { en: 'Scan path', es: 'Ruta de escaneo', pt: 'Caminho de leitura', pl: 'Ścieżka skanowania', ru: 'Путь обзора' },
  step:      { en: 'Step', es: 'Paso', pt: 'Passo', pl: 'Krok', ru: 'Шаг' },
  quickLinks: {
    dashboard: { en: 'Dashboard', es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель' },
    outreach:  { en: 'Outreach Engine', es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik outreach', ru: 'Движок аутрича' },
    pricing:   { en: 'Pricing', es: 'Precios', pt: 'Preços', pl: 'Cennik', ru: 'Цены' },
    support:   { en: 'Support', es: 'Soporte', pt: 'Suporte', pl: 'Wsparcie', ru: 'Поддержка' },
  },
  sections: [
    {
      step: '1',
      title: { en: 'Choose an intent', es: 'Elige una intención', pt: 'Escolha uma intenção', pl: 'Wybierz intencję', ru: 'Выберите намерение' },
      body:  { en: 'Start with Promote, Builder, Reviews, Audio, Video, or Outreach so every workflow has one clear goal.', es: 'Comienza con Promocionar, Constructor, Reseñas, Audio, Video o Prospección para que cada flujo tenga un objetivo claro.', pt: 'Comece com Promover, Construtor, Avaliações, Áudio, Vídeo ou Prospecção para que cada fluxo tenha um objetivo claro.', pl: 'Zacznij od Promocji, Kreatora, Opinii, Audio, Wideo lub Outreachu, aby każdy przepływ miał jeden jasny cel.', ru: 'Начните с Продвижения, Конструктора, Отзывов, Аудио, Видео или Аутрича, чтобы каждый процесс имел одну чёткую цель.' },
    },
    {
      step: '2',
      title: { en: 'Let AI suggest first', es: 'Deja que la IA sugiera primero', pt: 'Deixe a IA sugerir primeiro', pl: 'Najpierw pozwól AI zasugerować', ru: 'Сначала пусть ИИ предложит' },
      body:  { en: 'Read the suggested prompt, tone, and feedback before typing your own instructions.', es: 'Lee el prompt sugerido, el tono y el feedback antes de escribir tus propias instrucciones.', pt: 'Leia o prompt sugerido, o tom e o feedback antes de digitar suas próprias instruções.', pl: 'Przeczytaj sugerowany prompt, ton i informacje zwrotne przed wpisaniem własnych instrukcji.', ru: 'Прочитайте предложенный промпт, тон и обратную связь перед вводом собственных инструкций.' },
    },
    {
      step: '3',
      title: { en: 'Review generated assets', es: 'Revisa los activos generados', pt: 'Revise os ativos gerados', pl: 'Przejrzyj wygenerowane zasoby', ru: 'Проверьте созданные материалы' },
      body:  { en: 'Scan grouped cards: summary, audience, copy, proof, and risks. Avoid bouncing between unrelated panels.', es: 'Escanea tarjetas agrupadas: resumen, audiencia, copy, prueba y riesgos. Evita saltar entre paneles no relacionados.', pt: 'Escaneie cartões agrupados: resumo, público, copy, prova e riscos. Evite pular entre painéis não relacionados.', pl: 'Skanuj zgrupowane karty: podsumowanie, odbiorcy, treść, dowód i ryzyka. Unikaj przeskakiwania między niezwiązanymi panelami.', ru: 'Просматривайте сгруппированные карточки: резюме, аудитория, текст, доказательства и риски. Избегайте прыжков между несвязанными панелями.' },
    },
    {
      step: '4',
      title: { en: 'Approve and publish', es: 'Aprueba y publica', pt: 'Aprove e publique', pl: 'Zatwierdź i opublikuj', ru: 'Одобрите и опубликуйте' },
      body:  { en: 'Use the approval queue for final human judgment before outreach or public content goes live.', es: 'Usa la cola de aprobación para el juicio humano final antes de que el outreach o el contenido público se publique.', pt: 'Use a fila de aprovação para o julgamento humano final antes que o outreach ou conteúdo público seja publicado.', pl: 'Użyj kolejki zatwierdzania do ostatecznej oceny ludzkiej przed uruchomieniem outreachu lub treści publicznych.', ru: 'Используйте очередь одобрения для финального человеческого решения перед публикацией аутрича или публичного контента.' },
    },
  ],
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function DocsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const quickLinks = [
    { label: c(COPY.quickLinks.dashboard, l), href: '/dashboard' },
    { label: c(COPY.quickLinks.outreach, l),  href: '/dashboard/outreach/outreach' },
    { label: c(COPY.quickLinks.pricing, l),   href: '/pricing' },
    { label: c(COPY.quickLinks.support, l),   href: '/support' },
  ]

  return (
    <div className="sb-page-shell" style={{ padding: 'clamp(18px,4vw,48px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      {/* Header */}
      <section style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.16), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 28, padding: 'clamp(22px,4vw,36px)' }}>
        <p className="sb-eyebrow">📖 {c(COPY.eyebrow, l)}</p>
        <h1 style={{ fontSize: 'clamp(24px,5vw,48px)', fontWeight: 900, letterSpacing: '-.05em', lineHeight: 1.05, margin: '10px 0 12px' }}>{c(COPY.title, l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.7, maxWidth: 720, margin: '0 0 20px' }}>{c(COPY.subtitle, l)}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {quickLinks.map(({ label, href }) => (
            <Link key={href} className="sb-button-secondary" href={href} style={{ fontSize: 13, padding: '9px 16px' }}>{label}</Link>
          ))}
        </div>
      </section>

      {/* Body */}
      <section style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

        {/* Sidebar nav */}
        <aside style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: 20, position: 'sticky', top: 100 }}>
          <p className="sb-eyebrow" style={{ marginBottom: 14 }}>{c(COPY.scanPath, l)}</p>
          <nav style={{ display: 'grid', gap: 10 }}>
            {COPY.sections.map(s => (
              <a key={s.step} href={`#step-${s.step}`} style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#ffc300', fontWeight: 900, fontSize: 11, marginTop: 2, flexShrink: 0 }}>{c(COPY.step, l)} {s.step}</span>
                {c(s.title, l)}
              </a>
            ))}
          </nav>
        </aside>

        {/* Steps */}
        <div style={{ display: 'grid', gap: 14 }}>
          {COPY.sections.map(s => (
            <article key={s.step} id={`step-${s.step}`} style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: 'clamp(18px,3vw,26px)' }}>
              <p className="sb-eyebrow" style={{ marginBottom: 8 }}>{c(COPY.step, l)} {s.step}</p>
              <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 10px' }}>{c(s.title, l)}</h2>
              <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, fontSize: 14, margin: 0 }}>{c(s.body, l)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
