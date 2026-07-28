'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  badge:       { en: uiText('generatedUi.u_fb6d0aa2b6867976'), es: '🚀 SIGNALBOOST LAUNCHPAD', pt: '🚀 SIGNALBOOST LAUNCHPAD', pl: '🚀 SIGNALBOOST LAUNCHPAD', ru: '🚀 SIGNALBOOST LAUNCHPAD' },
  title1:      { en: uiText('generatedUi.u_863b7ce7fbae71ca'), es: 'Dinos qué quieres', pt: 'Diga-nos o que você quer', pl: 'Powiedz nam co chcesz', ru: 'Расскажите, что хотите' },
  title2:      { en: uiText('generatedUi.u_0fdabe9846bba059'), es: 'construir', pt: 'construir', pl: 'zbudować', ru: 'создать' },
  subtitle:    { en: uiText('generatedUi.u_59bc3fddb3f3e7ba'), es: 'Tú traes la idea. SignalBoost ayuda a construirla y lanzarla. Para ayudarte mejor, elige cuánta orientación quieres.', pt: 'Você traz a ideia. SignalBoost ajuda a construir e lançar. Para ajudá-lo melhor, escolha quanta orientação deseja.', pl: 'Ty masz pomysł. SignalBoost pomaga go zbudować i uruchomić. Aby lepiej Ci pomóc, wybierz ile wskazówek chcesz.', ru: 'Вы приносите идею. SignalBoost помогает её создать и запустить. Выберите, сколько руководства вам нужно.' },
  step1:       { en: uiText('generatedUi.u_35fb0674e89c900c'), es: '1. ¿Qué quieres lanzar?', pt: '1. O que você quer lançar?', pl: '1. Co chcesz uruchomić?', ru: '1. Что хотите запустить?' },
  step2:       { en: uiText('generatedUi.u_a99ac6cf2cded0aa'), es: '2. ¿Cómo debería ayudarte SignalBoost?', pt: '2. Como o SignalBoost deve te ajudar?', pl: '2. Jak SignalBoost powinien Ci pomóc?', ru: '2. Как SignalBoost должен вам помочь?' },
  step2sub:    { en: uiText('generatedUi.u_4efe7ee38d277d94'), es: 'Esto ayuda a SignalBoost a ajustar el lenguaje, los pasos y los detalles técnicos mostrados.', pt: 'Isso ajuda o SignalBoost a ajustar a linguagem, as etapas e os detalhes técnicos exibidos.', pl: 'Pomaga to SignalBoost dostosować język, kroki i szczegóły techniczne do Ciebie.', ru: 'Это помогает SignalBoost адаптировать язык, шаги и технические детали для вас.' },
  previewNote: { en: uiText('generatedUi.u_bb4099d4a436eb39'), es: 'SignalBoost usará tu nivel de experiencia seleccionado para mantener los próximos pasos claros y apropiados.', pt: 'SignalBoost usará seu nível de experiência selecionado para manter as próximas etapas claras e apropriadas.', pl: 'SignalBoost użyje wybranego poziomu doświadczenia, aby kolejne kroki były jasne i odpowiednie dla Ciebie.', ru: 'SignalBoost использует выбранный уровень опыта для адаптации следующих шагов.' },
  continue:    { en: uiText('generatedUi.u_496267ccc6b01605'), es: 'Continuar →', pt: 'Continuar →', pl: 'Kontynuuj →', ru: 'Продолжить →' },
  choosePath:  { en: uiText('generatedUi.u_162c5837506b2d47'), es: 'Elige una ruta y nivel de orientación', pt: 'Escolha um caminho e nível de orientação', pl: 'Wybierz ścieżkę i poziom wskazówek', ru: 'Выберите путь и уровень руководства' },
  stepsIn5:    { en: uiText('generatedUi.u_b7595e2a863957fc'), es: 'pasos', pt: 'passos', pl: 'kroków', ru: 'шагов' },
  buildYour:   { en: uiText('generatedUi.u_8d3e17e88c18acfa'), es: 'Construye tu', pt: 'Construa seu', pl: 'Zbuduj swój', ru: 'Создайте свой' },
  paths: [
    {
      icon: '🏪', id: "business",
      title:   { en: uiText('generatedUi.u_15ac2c642bd5b4ce'), es: 'Pequeño negocio', pt: 'Pequeno negócio', pl: 'Mały biznes', ru: 'Малый бизнес' },
      desc:    { en: uiText('generatedUi.u_92cf32d80923fe18'), es: 'Lanza una panadería, restaurante, agencia de viajes, servicio local y más.', pt: 'Lance uma padaria, restaurante, agência de viagens, serviço local e mais.', pl: 'Uruchom piekarnię, restaurację, agencję turystyczną, lokalną usługę i więcej.', ru: 'Запустите пекарню, ресторан, турагентство, местный сервис и многое другое.' },
      previewTitle: { en: uiText('generatedUi.u_29eec1ffaaa08830'), es: '🏪 Construye tu negocio en 5 pasos', pt: '🏪 Construa seu negócio em 5 passos', pl: '🏪 Zbuduj swój biznes w 5 krokach', ru: '🏪 Создайте бизнес за 5 шагов' },
      href: "/dashboard/launchpad/business",
      steps: {
        s1: { en: uiText('generatedUi.u_a7d61367de051823'), es: 'Describe tu negocio', pt: 'Descreva seu negócio', pl: 'Opisz swój biznes', ru: 'Опишите свой бизнес' },
        s2: { en: uiText('generatedUi.u_8fea23be7c4319cd'), es: 'Crea el nombre del negocio', pt: 'Crie o nome do negócio', pl: 'Utwórz nazwę firmy', ru: 'Создайте название бизнеса' },
        s3: { en: uiText('generatedUi.u_e04c4ae90e211a02'), es: 'Genera el sitio web', pt: 'Gere o site', pl: 'Wygeneruj stronę', ru: 'Создайте сайт' },
        s4: { en: uiText('generatedUi.u_3f5d875ba35c45e1'), es: 'Prepara el marketing', pt: 'Prepare o marketing', pl: 'Przygotuj marketing', ru: 'Подготовьте маркетинг' },
        s5: { en: uiText('generatedUi.u_fd88325454c4b8da'), es: 'Lanza el negocio', pt: 'Lance o negócio', pl: 'Uruchom biznes', ru: 'Запустите бизнес' },
      },
    },
    {
      icon: '🎙️', id: "podcast",
      title:   { en: uiText('generatedUi.u_27a723d62938b468'), es: 'Podcast', pt: 'Podcast', pl: 'Podcast', ru: 'Подкаст' },
      desc:    { en: uiText('generatedUi.u_2ddf05ad5ed89b45'), es: 'Construye tu podcast paso a paso — incluso si nunca creaste uno.', pt: 'Construa seu podcast passo a passo — mesmo se nunca criou um.', pl: 'Zbuduj swój podcast krok po kroku — nawet jeśli nigdy tego nie robiłeś.', ru: 'Создайте подкаст пошагово — даже если никогда не делали этого.' },
      previewTitle: { en: uiText('generatedUi.u_56b661ee66b3d892'), es: '🎙️ Construye tu podcast en 5 pasos', pt: '🎙️ Construa seu podcast em 5 passos', pl: '🎙️ Zbuduj swój podcast w 5 krokach', ru: '🎙️ Создайте подкаст за 5 шагов' },
      href: "/dashboard/launchpad/podcast",
      steps: {
        s1: { en: uiText('generatedUi.u_4f543b9630f6dcca'), es: 'Elige el tema de tu podcast', pt: 'Escolha o tema do seu podcast', pl: 'Wybierz temat podcastu', ru: 'Выберите тему подкаста' },
        s2: { en: uiText('generatedUi.u_883e6f7baf4a47c7'), es: 'Elige el nombre de tu podcast', pt: 'Escolha o nome do podcast', pl: 'Wybierz nazwę podcastu', ru: 'Выберите название подкаста' },
        s3: { en: uiText('generatedUi.u_f37f94d6845222b6'), es: 'Crea ideas para el primer episodio', pt: 'Crie ideias para o primeiro episódio', pl: 'Stwórz pomysły na pierwszy odcinek', ru: 'Создайте идеи для первого эпизода' },
        s4: { en: uiText('generatedUi.u_b2a3221048ff7f3e'), es: 'Genera tu página de podcast', pt: 'Gere sua página de podcast', pl: 'Wygeneruj stronę podcastu', ru: 'Создайте страницу подкаста' },
        s5: { en: uiText('generatedUi.u_5b2dc447a8de196c'), es: 'Lanza tu programa', pt: 'Lance seu programa', pl: 'Uruchom swój program', ru: 'Запустите шоу' },
      },
    },
    {
      icon: '🎬', id: "creator",
      title:   { en: uiText('generatedUi.u_9b3fb4ae093a349d'), es: 'Marca de Creador', pt: 'Marca de Criador', pl: 'Marka twórcy', ru: 'Бренд создателя' },
      desc:    { en: uiText('generatedUi.u_af75680280e95cba'), es: 'Construye un ecosistema de creador de contenido y crece tu audiencia.', pt: 'Construa um ecossistema de criador de conteúdo e cresça sua audiência.', pl: 'Zbuduj ekosystem twórcy treści i rozwijaj widownię.', ru: 'Создайте экосистему контент-создателя и развивайте аудиторию.' },
      previewTitle: { en: uiText('generatedUi.u_ac9abd29460e7607'), es: '🎬 Construye tu marca de creador en 5 pasos', pt: '🎬 Construa sua marca de criador em 5 passos', pl: '🎬 Zbuduj markę twórcy w 5 krokach', ru: '🎬 Создайте бренд создателя за 5 шагов' },
      href: "/dashboard/launchpad/creator",
      steps: {
        s1: { en: uiText('generatedUi.u_12633a3c05124331'), es: 'Define tu nicho de creador', pt: 'Defina seu nicho de criador', pl: 'Zdefiniuj swoją niszę twórcy', ru: 'Определите вашу нишу создателя' },
        s2: { en: uiText('generatedUi.u_aaa4091acfa051e9'), es: 'Construye tu sitio de creador', pt: 'Construa seu site de criador', pl: 'Zbuduj swoją stronę twórcy', ru: 'Создайте сайт создателя' },
        s3: { en: uiText('generatedUi.u_e6b4b7d5c4fa2d5b'), es: 'Genera audio nativo', pt: 'Gere áudio nativo', pl: 'Wygeneruj natywne audio', ru: 'Создайте нативное аудио' },
        s4: { en: uiText('generatedUi.u_a38ec6742c1f26f3'), es: 'Crea videos cortos', pt: 'Crie vídeos curtos', pl: 'Twórz krótkie filmy', ru: 'Создайте короткие видео' },
        s5: { en: uiText('generatedUi.u_a4984048a13ac9e4'), es: 'Crece con promoción', pt: 'Cresça com promoção', pl: 'Rozwijaj się z promocją', ru: 'Развивайтесь с продвижением' },
      },
    },
    {
      icon: '🛒', id: "store",
      title:   { en: uiText('generatedUi.u_c50970c1903db9ae'), es: 'Tienda Online', pt: 'Loja Online', pl: 'Sklep Online', ru: 'Интернет-магазин' },
      desc:    { en: uiText('generatedUi.u_3a8d010dfc53f7ec'), es: 'Vende productos online con soporte de sitio web y marketing.', pt: 'Venda produtos online com suporte de site e marketing.', pl: 'Sprzedawaj produkty online z wsparciem strony i marketingu.', ru: 'Продавайте товары онлайн с поддержкой сайта и маркетинга.' },
      previewTitle: { en: uiText('generatedUi.u_5e5fcdd64ae83574'), es: '🛒 Construye tu tienda online en 5 pasos', pt: '🛒 Construa sua loja online em 5 passos', pl: '🛒 Zbuduj sklep online w 5 krokach', ru: '🛒 Создайте интернет-магазин за 5 шагов' },
      href: "/dashboard/launchpad/store",
      steps: {
        s1: { en: uiText('generatedUi.u_559658222419eb16'), es: 'Describe tus productos', pt: 'Descreva seus produtos', pl: 'Opisz swoje produkty', ru: 'Опишите ваши товары' },
        s2: { en: uiText('generatedUi.u_65e76c2255bbbeae'), es: 'Construye tu tienda', pt: 'Construa sua loja', pl: 'Zbuduj swój sklep', ru: 'Создайте витрину магазина' },
        s3: { en: uiText('generatedUi.u_3b32394fb127f45b'), es: 'Crea videos de productos', pt: 'Crie vídeos de produtos', pl: 'Twórz filmy o produktach', ru: 'Создайте видео о товарах' },
        s4: { en: uiText('generatedUi.u_fc3af37c88433a1e'), es: 'Recopila reseñas de productos', pt: 'Colete avaliações de produtos', pl: 'Zbieraj opinie o produktach', ru: 'Соберите отзывы о товарах' },
        s5: { en: uiText('generatedUi.u_f7c134e65f094209'), es: 'Lanza el marketing', pt: 'Lance o marketing', pl: 'Uruchom marketing', ru: 'Запустите маркетинг' },
      },
    },
  ],
  experiences: [
    {
      id: "guided", icon: '🌱',
      title: { en: uiText('generatedUi.u_b91d958acac03ba3'), es: 'Guiado', pt: 'Guiado', pl: 'Guided', ru: 'С руководством' },
      desc:  { en: uiText('generatedUi.u_a76e4217d7eac852'), es: 'Mantenlo simple. Guíame por cada paso y ocúpate de las partes técnicas.', pt: 'Mantenha simples. Me guie por cada etapa e cuide das partes técnicas.', pl: 'Prosto. Przeprowadź mnie przez każdy krok i zajmij się częściami technicznymi.', ru: 'Просто. Проведите меня по каждому шагу и займитесь техническими частями.' },
    },
    {
      id: "assisted", icon: '⚙️',
      title: { en: uiText('generatedUi.u_7c090185ba9c811f'), es: 'Asistido', pt: 'Assistido', pl: 'Wspomagany', ru: 'С поддержкой' },
      desc:  { en: uiText('generatedUi.u_d33ae422826df085'), es: 'Guíame, pero déjame tomar algunas decisiones por el camino.', pt: 'Me guie, mas deixe-me tomar algumas decisões ao longo do caminho.', pl: 'Prowadź mnie, ale pozwól mi podejmować niektóre decyzje.', ru: 'Ведите меня, но позвольте принимать некоторые решения.' },
    },
    {
      id: "power", icon: '🚀',
      title: { en: uiText('generatedUi.u_1a246f3a818858a7'), es: 'Usuario avanzado', pt: 'Usuário avançado', pl: 'Zaawansowany', ru: 'Опытный пользователь' },
      desc:  { en: uiText('generatedUi.u_56118905ba6598b2'), es: 'Muestra opciones avanzadas y dame más control técnico.', pt: 'Mostre opções avançadas e me dê mais controle técnico.', pl: 'Pokaż zaawansowane opcje i daj mi więcej kontroli technicznej.', ru: 'Покажите расширенные параметры и дайте больше технического контроля.' },
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
  const previewRef                  = useRef<HTMLDivElement>(null)

  const selectedPath = COPY.paths.find(p => p.id === selected)
  const canContinue  = Boolean(selectedPath && experience)

  // Selecting a path is a real action — bring its 5-step preview into view
  // so the click visibly does something and the Continue button is found.
  useEffect(() => {
    if (selectedPath) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected, experience, selectedPath])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      <div style={{ minHeight: 'calc(100vh - 125px)', display: 'grid', gap: 22, alignContent: 'start' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 999, background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.22)', color: '#ffc300', fontWeight: 900, fontSize: 10, letterSpacing: '.1em', marginBottom: 10 }}>
          {c(COPY.badge, l)}
        </div>
        <h1 style={{ fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 950, lineHeight: 1.05, margin: '0 0 8px', letterSpacing: '-.045em' }}>
          {c(COPY.title1, l)} <span style={{ color: '#ffc300' }}>{c(COPY.title2, l)}</span>
        </h1>
        <p style={{ maxWidth: 640, margin: '0 auto', color: 'rgba(255,255,255,.55)', lineHeight: 1.6, fontSize: 13 }}>{c(COPY.subtitle, l)}</p>
      </div>

      {/* Step 1 — path */}
      <section>
        <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: 16 }}>{c(COPY.step1, l)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {COPY.paths.map(path => {
            const active = selected === path.id
            return (
              <button key={path.id} onClick={() => setSelected(path.id)} style={{ cursor: 'pointer', padding: 16, borderRadius: 18, background: active ? 'rgba(255,195,0,.08)' : 'rgba(255,255,255,.03)', border: active ? '1px solid rgba(255,195,0,.42)' : '1px solid rgba(255,255,255,.09)', transition: 'all .2s', color: '#fff', textAlign: 'left', boxShadow: active ? '0 0 32px rgba(255,195,0,.12)' : 'none' }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{path.icon}</div>
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
              <button key={level.id} onClick={() => setExperience(level.id)} style={{ cursor: 'pointer', padding: 16, borderRadius: 18, background: active ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.03)', border: active ? '1px solid rgba(59,130,246,.44)' : '1px solid rgba(255,255,255,.09)', transition: 'all .2s', color: '#fff', textAlign: 'left', boxShadow: active ? '0 0 28px rgba(59,130,246,.14)' : 'none' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{level.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800 }}>{c(level.title, l)}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.5)', margin: 0 }}>{c(level.desc, l)}</p>
              </button>
            )
          })}
        </div>
      </section>

      </div>

      {/* Preview — second screen */}
      {selectedPath && (
        <div ref={previewRef} style={{ borderTop: '1px solid rgba(255,195,0,.3)', paddingTop: 22, scrollMarginTop: 80 }}>
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
            <span aria-disabled="true" style={{ display: 'inline-block', padding: '13px 28px', borderRadius: 999, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.3)', fontWeight: 900, border: 'none', cursor: 'not-allowed', fontSize: 14 }}>
              {c(COPY.choosePath, l)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
