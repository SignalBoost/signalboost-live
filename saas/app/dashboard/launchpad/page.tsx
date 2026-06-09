'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  badge:       { en: '🚀 SIGNALBOOST LAUNCHPAD', es: '🚀 SIGNALBOOST LAUNCHPAD', pt: '🚀 SIGNALBOOST LAUNCHPAD', pl: '🚀 SIGNALBOOST LAUNCHPAD', ru: '🚀 SIGNALBOOST LAUNCHPAD' },
  title1:      { en: 'Tell us what you want', es: 'Dinos qué quieres', pt: 'Diga-nos o que você quer', pl: 'Powiedz nam co chcesz', ru: 'Расскажите, что хотите' },
  title2:      { en: 'to build', es: 'construir', pt: 'construir', pl: 'zbudować', ru: 'создать' },
  subtitle:    { en: 'You bring the idea. SignalBoost helps build and launch it. To help you better, choose how much guidance you want.', es: 'Tú traes la idea. SignalBoost ayuda a construirla y lanzarla. Para ayudarte mejor, elige cuánta orientación quieres.', pt: 'Você traz a ideia. SignalBoost ajuda a construir e lançar. Para ajudá-lo melhor, escolha quanta orientação deseja.', pl: 'Ty masz pomysł. SignalBoost pomaga go zbudować i uruchomić. Aby lepiej Ci pomóc, wybierz ile wskazówek chcesz.', ru: 'Вы приносите идею. SignalBoost помогает её создать и запустить. Выберите, сколько руководства вам нужно.' },
  step1:       { en: '1. What do you want to launch?', es: '1. ¿Qué quieres lanzar?', pt: '1. O que você quer lançar?', pl: '1. Co chcesz uruchomić?', ru: '1. Что хотите запустить?' },
  step2:       { en: '2. How should SignalBoost help you?', es: '2. ¿Cómo debería ayudarte SignalBoost?', pt: '2. Como o SignalBoost deve te ajudar?', pl: '2. Jak SignalBoost powinien Ci pomóc?', ru: '2. Как SignalBoost должен вам помочь?' },
  step2sub:    { en: 'This helps SignalBoost adjust the language, steps and technical details shown to you.', es: 'Esto ayuda a SignalBoost a ajustar el lenguaje, los pasos y los detalles técnicos mostrados.', pt: 'Isso ajuda o SignalBoost a ajustar a linguagem, as etapas e os detalhes técnicos exibidos.', pl: 'Pomaga to SignalBoost dostosować język, kroki i szczegóły techniczne do Ciebie.', ru: 'Это помогает SignalBoost адаптировать язык, шаги и технические детали для вас.' },
  previewNote: { en: 'SignalBoost will use your selected experience level to keep the next steps clear and appropriate for you.', es: 'SignalBoost usará tu nivel de experiencia seleccionado para mantener los próximos pasos claros y apropiados.', pt: 'SignalBoost usará seu nível de experiência selecionado para manter as próximas etapas claras e apropriadas.', pl: 'SignalBoost użyje wybranego poziomu doświadczenia, aby kolejne kroki były jasne i odpowiednie dla Ciebie.', ru: 'SignalBoost использует выбранный уровень опыта для адаптации следующих шагов.' },
  continue:    { en: 'Continue →', es: 'Continuar →', pt: 'Continuar →', pl: 'Kontynuuj →', ru: 'Продолжить →' },
  choosePath:  { en: 'Choose a path and guidance level', es: 'Elige una ruta y nivel de orientación', pt: 'Escolha um caminho e nível de orientação', pl: 'Wybierz ścieżkę i poziom wskazówek', ru: 'Выберите путь и уровень руководства' },
  stepsIn5:    { en: 'steps', es: 'pasos', pt: 'passos', pl: 'kroków', ru: 'шагов' },
  buildYour:   { en: 'Build your', es: 'Construye tu', pt: 'Construa seu', pl: 'Zbuduj swój', ru: 'Создайте свой' },
  paths: [
    {
      icon: '🏪', id: 'business',
      title:   { en: 'Small Business', es: 'Pequeño negocio', pt: 'Pequeno negócio', pl: 'Mały biznes', ru: 'Малый бизнес' },
      desc:    { en: 'Launch a bakery, restaurant, travel company, local service and more.', es: 'Lanza una panadería, restaurante, agencia de viajes, servicio local y más.', pt: 'Lance uma padaria, restaurante, agência de viagens, serviço local e mais.', pl: 'Uruchom piekarnię, restaurację, agencję turystyczną, lokalną usługę i więcej.', ru: 'Запустите пекарню, ресторан, турагентство, местный сервис и многое другое.' },
      previewTitle: { en: '🏪 Build your business in 5 steps', es: '🏪 Construye tu negocio en 5 pasos', pt: '🏪 Construa seu negócio em 5 passos', pl: '🏪 Zbuduj swój biznes w 5 krokach', ru: '🏪 Создайте бизнес за 5 шагов' },
      href: '/dashboard/launchpad/business',
      steps: {
        s1: { en: 'Describe your business', es: 'Describe tu negocio', pt: 'Descreva seu negócio', pl: 'Opisz swój biznes', ru: 'Опишите свой бизнес' },
        s2: { en: 'Create business name', es: 'Crea el nombre del negocio', pt: 'Crie o nome do negócio', pl: 'Utwórz nazwę firmy', ru: 'Создайте название бизнеса' },
        s3: { en: 'Generate website', es: 'Genera el sitio web', pt: 'Gere o site', pl: 'Wygeneruj stronę', ru: 'Создайте сайт' },
        s4: { en: 'Prepare marketing', es: 'Prepara el marketing', pt: 'Prepare o marketing', pl: 'Przygotuj marketing', ru: 'Подготовьте маркетинг' },
        s5: { en: 'Launch business', es: 'Lanza el negocio', pt: 'Lance o negócio', pl: 'Uruchom biznes', ru: 'Запустите бизнес' },
      },
    },
    {
      icon: '🎙️', id: 'podcast',
      title:   { en: 'Podcast', es: 'Podcast', pt: 'Podcast', pl: 'Podcast', ru: 'Подкаст' },
      desc:    { en: 'Build your podcast in guided steps — even if you never created one.', es: 'Construye tu podcast paso a paso — incluso si nunca creaste uno.', pt: 'Construa seu podcast passo a passo — mesmo se nunca criou um.', pl: 'Zbuduj swój podcast krok po kroku — nawet jeśli nigdy tego nie robiłeś.', ru: 'Создайте подкаст пошагово — даже если никогда не делали этого.' },
      previewTitle: { en: '🎙️ Build your podcast in 5 steps', es: '🎙️ Construye tu podcast en 5 pasos', pt: '🎙️ Construa seu podcast em 5 passos', pl: '🎙️ Zbuduj swój podcast w 5 krokach', ru: '🎙️ Создайте подкаст за 5 шагов' },
      href: '/dashboard/launchpad/podcast',
      steps: {
        s1: { en: 'Choose your podcast topic', es: 'Elige el tema de tu podcast', pt: 'Escolha o tema do seu podcast', pl: 'Wybierz temat podcastu', ru: 'Выберите тему подкаста' },
        s2: { en: 'Pick your podcast name', es: 'Elige el nombre de tu podcast', pt: 'Escolha o nome do podcast', pl: 'Wybierz nazwę podcastu', ru: 'Выберите название подкаста' },
        s3: { en: 'Create first episode ideas', es: 'Crea ideas para el primer episodio', pt: 'Crie ideias para o primeiro episódio', pl: 'Stwórz pomysły na pierwszy odcinek', ru: 'Создайте идеи для первого эпизода' },
        s4: { en: 'Generate your podcast page', es: 'Genera tu página de podcast', pt: 'Gere sua página de podcast', pl: 'Wygeneruj stronę podcastu', ru: 'Создайте страницу подкаста' },
        s5: { en: 'Launch your show', es: 'Lanza tu programa', pt: 'Lance seu programa', pl: 'Uruchom swój program', ru: 'Запустите шоу' },
      },
    },
    {
      icon: '🎬', id: 'creator',
      title:   { en: 'Creator Brand', es: 'Marca de Creador', pt: 'Marca de Criador', pl: 'Marka twórcy', ru: 'Бренд создателя' },
      desc:    { en: 'Build a content creator ecosystem and grow an audience.', es: 'Construye un ecosistema de creador de contenido y crece tu audiencia.', pt: 'Construa um ecossistema de criador de conteúdo e cresça sua audiência.', pl: 'Zbuduj ekosystem twórcy treści i rozwijaj widownię.', ru: 'Создайте экосистему контент-создателя и развивайте аудиторию.' },
      previewTitle: { en: '🎬 Build your creator brand in 5 steps', es: '🎬 Construye tu marca de creador en 5 pasos', pt: '🎬 Construa sua marca de criador em 5 passos', pl: '🎬 Zbuduj markę twórcy w 5 krokach', ru: '🎬 Создайте бренд создателя за 5 шагов' },
      href: '/dashboard/launchpad/creator',
      steps: {
        s1: { en: 'Define your creator niche', es: 'Define tu nicho de creador', pt: 'Defina seu nicho de criador', pl: 'Zdefiniuj swoją niszę twórcy', ru: 'Определите вашу нишу создателя' },
        s2: { en: 'Build your creator site', es: 'Construye tu sitio de creador', pt: 'Construa seu site de criador', pl: 'Zbuduj swoją stronę twórcy', ru: 'Создайте сайт создателя' },
        s3: { en: 'Generate native audio', es: 'Genera audio nativo', pt: 'Gere áudio nativo', pl: 'Wygeneruj natywne audio', ru: 'Создайте нативное аудио' },
        s4: { en: 'Create short-form videos', es: 'Crea videos cortos', pt: 'Crie vídeos curtos', pl: 'Twórz krótkie filmy', ru: 'Создайте короткие видео' },
        s5: { en: 'Grow with promotion', es: 'Crece con promoción', pt: 'Cresça com promoção', pl: 'Rozwijaj się z promocją', ru: 'Развивайтесь с продвижением' },
      },
    },
    {
      icon: '🛒', id: 'store',
      title:   { en: 'Online Store', es: 'Tienda Online', pt: 'Loja Online', pl: 'Sklep Online', ru: 'Интернет-магазин' },
      desc:    { en: 'Sell products online with website and marketing support.', es: 'Vende productos online con soporte de sitio web y marketing.', pt: 'Venda produtos online com suporte de site e marketing.', pl: 'Sprzedawaj produkty online z wsparciem strony i marketingu.', ru: 'Продавайте товары онлайн с поддержкой сайта и маркетинга.' },
      previewTitle: { en: '🛒 Build your online store in 5 steps', es: '🛒 Construye tu tienda online en 5 pasos', pt: '🛒 Construa sua loja online em 5 passos', pl: '🛒 Zbuduj sklep online w 5 krokach', ru: '🛒 Создайте интернет-магазин за 5 шагов' },
      href: '/dashboard/launchpad/store',
      steps: {
        s1: { en: 'Describe your products', es: 'Describe tus productos', pt: 'Descreva seus produtos', pl: 'Opisz swoje produkty', ru: 'Опишите ваши товары' },
        s2: { en: 'Build your storefront', es: 'Construye tu tienda', pt: 'Construa sua loja', pl: 'Zbuduj swój sklep', ru: 'Создайте витрину магазина' },
        s3: { en: 'Create product videos', es: 'Crea videos de productos', pt: 'Crie vídeos de produtos', pl: 'Twórz filmy o produktach', ru: 'Создайте видео о товарах' },
        s4: { en: 'Collect product reviews', es: 'Recopila reseñas de productos', pt: 'Colete avaliações de produtos', pl: 'Zbieraj opinie o produktach', ru: 'Соберите отзывы о товарах' },
        s5: { en: 'Launch marketing', es: 'Lanza el marketing', pt: 'Lance o marketing', pl: 'Uruchom marketing', ru: 'Запустите маркетинг' },
      },
    },
  ],
  experiences: [
    {
      id: 'guided', icon: '🌱',
      title: { en: 'Guided', es: 'Guiado', pt: 'Guiado', pl: 'Guided', ru: 'С руководством' },
      desc:  { en: 'Keep it simple. Walk me through each step and handle the technical parts.', es: 'Mantenlo simple. Guíame por cada paso y ocúpate de las partes técnicas.', pt: 'Mantenha simples. Me guie por cada etapa e cuide das partes técnicas.', pl: 'Prosto. Przeprowadź mnie przez każdy krok i zajmij się częściami technicznymi.', ru: 'Просто. Проведите меня по каждому шагу и займитесь техническими частями.' },
    },
    {
      id: 'assisted', icon: '⚙️',
      title: { en: 'Assisted', es: 'Asistido', pt: 'Assistido', pl: 'Wspomagany', ru: 'С поддержкой' },
      desc:  { en: 'Guide me, but let me make some decisions along the way.', es: 'Guíame, pero déjame tomar algunas decisiones por el camino.', pt: 'Me guie, mas deixe-me tomar algumas decisões ao longo do caminho.', pl: 'Prowadź mnie, ale pozwól mi podejmować niektóre decyzje.', ru: 'Ведите меня, но позвольте принимать некоторые решения.' },
    },
    {
      id: 'power', icon: '🚀',
      title: { en: 'Power User', es: 'Usuario avanzado', pt: 'Usuário avançado', pl: 'Zaawansowany', ru: 'Опытный пользователь' },
      desc:  { en: 'Show advanced options and give me more technical control.', es: 'Muestra opciones avanzadas y dame más control técnico.', pt: 'Mostre opções avançadas e me dê mais controle técnico.', pl: 'Pokaż zaawansowane opcje i daj mi więcej kontroli technicznej.', ru: 'Покажите расширенные параметры и дайте больше технического контроля.' },
    },
  ],
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function LaunchpadPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [selected, setSelected]     = useState('')
  const [experience, setExperience] = useState('')

  const selectedPath = COPY.paths.find(p => p.id === selected)
  const canContinue  = Boolean(selectedPath && experience)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(18px,4vw,48px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 32 }}>

      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '6px 14px', borderRadius: 999, background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.22)', color: '#ffc300', fontWeight: 900, fontSize: 11, letterSpacing: '.1em', marginBottom: 20 }}>
          {c(COPY.badge, l)}
        </div>
        <h1 style={{ fontSize: 'clamp(36px,7vw,72px)', fontWeight: 900, lineHeight: 1, margin: '0 0 16px', letterSpacing: '-.05em' }}>
          {c(COPY.title1, l)}<br /><span style={{ color: '#ffc300' }}>{c(COPY.title2, l)}</span>
        </h1>
        <p style={{ maxWidth: 640, margin: '0 auto', color: 'rgba(255,255,255,.55)', lineHeight: 1.8, fontSize: 15 }}>{c(COPY.subtitle, l)}</p>
      </div>

      {/* Step 1 — path */}
      <section>
        <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: 16 }}>{c(COPY.step1, l)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {COPY.paths.map(path => {
            const active = selected === path.id
            return (
              <button key={path.id} onClick={() => setSelected(path.id)} style={{ cursor: 'pointer', padding: 24, borderRadius: 22, background: active ? 'rgba(255,195,0,.08)' : 'rgba(255,255,255,.03)', border: active ? '1px solid rgba(255,195,0,.42)' : '1px solid rgba(255,255,255,.09)', transition: 'all .2s', color: '#fff', textAlign: 'left', boxShadow: active ? '0 0 32px rgba(255,195,0,.12)' : 'none' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{path.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>{c(path.title, l)}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.5)', margin: 0 }}>{c(path.desc, l)}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 2 — experience */}
      <section>
        <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 6px' }}>{c(COPY.step2, l)}</h2>
        <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, lineHeight: 1.6, maxWidth: 620, margin: '0 0 16px' }}>{c(COPY.step2sub, l)}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {COPY.experiences.map(level => {
            const active = experience === level.id
            return (
              <button key={level.id} onClick={() => setExperience(level.id)} style={{ cursor: 'pointer', padding: 22, borderRadius: 20, background: active ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.03)', border: active ? '1px solid rgba(59,130,246,.44)' : '1px solid rgba(255,255,255,.09)', transition: 'all .2s', color: '#fff', textAlign: 'left', boxShadow: active ? '0 0 28px rgba(59,130,246,.14)' : 'none' }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{level.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800 }}>{c(level.title, l)}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.5)', margin: 0 }}>{c(level.desc, l)}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Preview */}
      {selectedPath && (
        <div style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.12)', borderRadius: 26, padding: 'clamp(20px,4vw,32px)' }}>
          <h2 style={{ fontSize: 'clamp(16px,2.5vw,20px)', fontWeight: 900, margin: '0 0 20px', letterSpacing: '-.02em' }}>{c(selectedPath.previewTitle, l)}</h2>
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {(['s1','s2','s3','s4','s5'] as const).map((sk, i) => (
              <div key={sk} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#ffc300', fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ color: 'rgba(255,255,255,.75)', fontSize: 14 }}>{c((selectedPath.steps as any)[sk], l)}</span>
              </div>
            ))}
          </div>

          {experience && (
            <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 14, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.22)', color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: 1.6 }}>
              {c(COPY.previewNote, l)}
            </div>
          )}

          {canContinue ? (
            <Link href={`${selectedPath.href}?experience=${experience}`} className="sb-button-primary" style={{ display: 'inline-flex', fontSize: 15 }}>
              {c(COPY.continue, l)}
            </Link>
          ) : (
            <button disabled style={{ padding: '13px 28px', borderRadius: 999, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.3)', fontWeight: 900, border: 'none', cursor: 'not-allowed', fontSize: 14 }}>
              {c(COPY.choosePath, l)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
