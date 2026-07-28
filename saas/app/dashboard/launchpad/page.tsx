'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  badge:       { en: uiCopy('u_91982ce510d4e10c'), es: '🚀 SIGNALBOOST LAUNCHPAD', pt: '🚀 SIGNALBOOST LAUNCHPAD', pl: '🚀 SIGNALBOOST LAUNCHPAD', ru: '🚀 SIGNALBOOST LAUNCHPAD' },
  title1:      { en: uiCopy('u_ee4d1d5a93cfaa70'), es: 'Dinos qué quieres', pt: 'Diga-nos o que você quer', pl: 'Powiedz nam co chcesz', ru: 'Расскажите, что хотите' },
  title2:      { en: uiCopy('u_e18dced61c133c9e'), es: 'construir', pt: 'construir', pl: 'zbudować', ru: 'создать' },
  subtitle:    { en: uiCopy('u_70f40b3239fedc85'), es: 'Tú traes la idea. SignalBoost ayuda a construirla y lanzarla. Para ayudarte mejor, elige cuánta orientación quieres.', pt: 'Você traz a ideia. SignalBoost ajuda a construir e lançar. Para ajudá-lo melhor, escolha quanta orientação deseja.', pl: 'Ty masz pomysł. SignalBoost pomaga go zbudować i uruchomić. Aby lepiej Ci pomóc, wybierz ile wskazówek chcesz.', ru: 'Вы приносите идею. SignalBoost помогает её создать и запустить. Выберите, сколько руководства вам нужно.' },
  step1:       { en: uiCopy('u_4f007c07fb229d11'), es: '1. ¿Qué quieres lanzar?', pt: '1. O que você quer lançar?', pl: '1. Co chcesz uruchomić?', ru: '1. Что хотите запустить?' },
  step2:       { en: uiCopy('u_82080e1e8558c337'), es: '2. ¿Cómo debería ayudarte SignalBoost?', pt: '2. Como o SignalBoost deve te ajudar?', pl: '2. Jak SignalBoost powinien Ci pomóc?', ru: '2. Как SignalBoost должен вам помочь?' },
  step2sub:    { en: uiCopy('u_7ff09a28707e6062'), es: 'Esto ayuda a SignalBoost a ajustar el lenguaje, los pasos y los detalles técnicos mostrados.', pt: 'Isso ajuda o SignalBoost a ajustar a linguagem, as etapas e os detalhes técnicos exibidos.', pl: 'Pomaga to SignalBoost dostosować język, kroki i szczegóły techniczne do Ciebie.', ru: 'Это помогает SignalBoost адаптировать язык, шаги и технические детали для вас.' },
  previewNote: { en: uiCopy('u_6501d3b59fb40f12'), es: 'SignalBoost usará tu nivel de experiencia seleccionado para mantener los próximos pasos claros y apropiados.', pt: 'SignalBoost usará seu nível de experiência selecionado para manter as próximas etapas claras e apropriadas.', pl: 'SignalBoost użyje wybranego poziomu doświadczenia, aby kolejne kroki były jasne i odpowiednie dla Ciebie.', ru: 'SignalBoost использует выбранный уровень опыта для адаптации следующих шагов.' },
  continue:    { en: uiCopy('u_bb634a2a7396aa3d'), es: 'Continuar →', pt: 'Continuar →', pl: 'Kontynuuj →', ru: 'Продолжить →' },
  choosePath:  { en: uiCopy('u_c0504aa087c99545'), es: 'Elige una ruta y nivel de orientación', pt: 'Escolha um caminho e nível de orientação', pl: 'Wybierz ścieżkę i poziom wskazówek', ru: 'Выберите путь и уровень руководства' },
  stepsIn5:    { en: uiCopy('u_9af3721aa9a8d835'), es: 'pasos', pt: 'passos', pl: 'kroków', ru: 'шагов' },
  buildYour:   { en: uiCopy('u_3ac90b7bd7b881f1'), es: 'Construye tu', pt: 'Construa seu', pl: 'Zbuduj swój', ru: 'Создайте свой' },
  paths: [
    {
      icon: '🏪', id: uiCopy('u_3d61b650ce958811'),
      title:   { en: uiCopy('u_85f9e84461144177'), es: 'Pequeño negocio', pt: 'Pequeno negócio', pl: 'Mały biznes', ru: 'Малый бизнес' },
      desc:    { en: uiCopy('u_d21f6daea5ad03ff'), es: 'Lanza una panadería, restaurante, agencia de viajes, servicio local y más.', pt: 'Lance uma padaria, restaurante, agência de viagens, serviço local e mais.', pl: 'Uruchom piekarnię, restaurację, agencję turystyczną, lokalną usługę i więcej.', ru: 'Запустите пекарню, ресторан, турагентство, местный сервис и многое другое.' },
      previewTitle: { en: uiCopy('u_c556f7dfa6e6dd61'), es: '🏪 Construye tu negocio en 5 pasos', pt: '🏪 Construa seu negócio em 5 passos', pl: '🏪 Zbuduj swój biznes w 5 krokach', ru: '🏪 Создайте бизнес за 5 шагов' },
      href: uiCopy('u_b533b28faa126492'),
      steps: {
        s1: { en: uiCopy('u_963aef90c39a5e40'), es: 'Describe tu negocio', pt: 'Descreva seu negócio', pl: 'Opisz swój biznes', ru: 'Опишите свой бизнес' },
        s2: { en: uiCopy('u_392e75451e98fd86'), es: 'Crea el nombre del negocio', pt: 'Crie o nome do negócio', pl: 'Utwórz nazwę firmy', ru: 'Создайте название бизнеса' },
        s3: { en: uiCopy('u_5da7ca0347312760'), es: 'Genera el sitio web', pt: 'Gere o site', pl: 'Wygeneruj stronę', ru: 'Создайте сайт' },
        s4: { en: uiCopy('u_675a0042fc6027a8'), es: 'Prepara el marketing', pt: 'Prepare o marketing', pl: 'Przygotuj marketing', ru: 'Подготовьте маркетинг' },
        s5: { en: uiCopy('u_7ab3ec0528f813bf'), es: 'Lanza el negocio', pt: 'Lance o negócio', pl: 'Uruchom biznes', ru: 'Запустите бизнес' },
      },
    },
    {
      icon: '🎙️', id: uiCopy('u_208ebffad6075973'),
      title:   { en: uiCopy('u_1fc5d078428dee04'), es: 'Podcast', pt: 'Podcast', pl: 'Podcast', ru: 'Подкаст' },
      desc:    { en: uiCopy('u_abda258abe10a5ff'), es: 'Construye tu podcast paso a paso — incluso si nunca creaste uno.', pt: 'Construa seu podcast passo a passo — mesmo se nunca criou um.', pl: 'Zbuduj swój podcast krok po kroku — nawet jeśli nigdy tego nie robiłeś.', ru: 'Создайте подкаст пошагово — даже если никогда не делали этого.' },
      previewTitle: { en: uiCopy('u_a16a865e93f0f1d7'), es: '🎙️ Construye tu podcast en 5 pasos', pt: '🎙️ Construa seu podcast em 5 passos', pl: '🎙️ Zbuduj swój podcast w 5 krokach', ru: '🎙️ Создайте подкаст за 5 шагов' },
      href: uiCopy('u_2bc8dea1cd44f167'),
      steps: {
        s1: { en: uiCopy('u_662bfdc18757c1fd'), es: 'Elige el tema de tu podcast', pt: 'Escolha o tema do seu podcast', pl: 'Wybierz temat podcastu', ru: 'Выберите тему подкаста' },
        s2: { en: uiCopy('u_1918211c738ab446'), es: 'Elige el nombre de tu podcast', pt: 'Escolha o nome do podcast', pl: 'Wybierz nazwę podcastu', ru: 'Выберите название подкаста' },
        s3: { en: uiCopy('u_eae7ab162c368515'), es: 'Crea ideas para el primer episodio', pt: 'Crie ideias para o primeiro episódio', pl: 'Stwórz pomysły na pierwszy odcinek', ru: 'Создайте идеи для первого эпизода' },
        s4: { en: uiCopy('u_202fbf9a7614e630'), es: 'Genera tu página de podcast', pt: 'Gere sua página de podcast', pl: 'Wygeneruj stronę podcastu', ru: 'Создайте страницу подкаста' },
        s5: { en: uiCopy('u_8fb6f04fedd8293c'), es: 'Lanza tu programa', pt: 'Lance seu programa', pl: 'Uruchom swój program', ru: 'Запустите шоу' },
      },
    },
    {
      icon: '🎬', id: uiCopy('u_ab02ed813935b209'),
      title:   { en: uiCopy('u_970dd26538edf1ef'), es: 'Marca de Creador', pt: 'Marca de Criador', pl: 'Marka twórcy', ru: 'Бренд создателя' },
      desc:    { en: uiCopy('u_ca05980ed388b045'), es: 'Construye un ecosistema de creador de contenido y crece tu audiencia.', pt: 'Construa um ecossistema de criador de conteúdo e cresça sua audiência.', pl: 'Zbuduj ekosystem twórcy treści i rozwijaj widownię.', ru: 'Создайте экосистему контент-создателя и развивайте аудиторию.' },
      previewTitle: { en: uiCopy('u_4069d2fb73d80a6f'), es: '🎬 Construye tu marca de creador en 5 pasos', pt: '🎬 Construa sua marca de criador em 5 passos', pl: '🎬 Zbuduj markę twórcy w 5 krokach', ru: '🎬 Создайте бренд создателя за 5 шагов' },
      href: uiCopy('u_416f17040889c202'),
      steps: {
        s1: { en: uiCopy('u_b8f7c8cf17766e49'), es: 'Define tu nicho de creador', pt: 'Defina seu nicho de criador', pl: 'Zdefiniuj swoją niszę twórcy', ru: 'Определите вашу нишу создателя' },
        s2: { en: uiCopy('u_7e6771a4d36473ae'), es: 'Construye tu sitio de creador', pt: 'Construa seu site de criador', pl: 'Zbuduj swoją stronę twórcy', ru: 'Создайте сайт создателя' },
        s3: { en: uiCopy('u_0982fa0c5d92744f'), es: 'Genera audio nativo', pt: 'Gere áudio nativo', pl: 'Wygeneruj natywne audio', ru: 'Создайте нативное аудио' },
        s4: { en: uiCopy('u_a91eee7757169475'), es: 'Crea videos cortos', pt: 'Crie vídeos curtos', pl: 'Twórz krótkie filmy', ru: 'Создайте короткие видео' },
        s5: { en: uiCopy('u_9f1e9c12912da430'), es: 'Crece con promoción', pt: 'Cresça com promoção', pl: 'Rozwijaj się z promocją', ru: 'Развивайтесь с продвижением' },
      },
    },
    {
      icon: '🛒', id: uiCopy('u_3e1497de9e4bf00a'),
      title:   { en: uiCopy('u_97e87fdd9022fe42'), es: 'Tienda Online', pt: 'Loja Online', pl: 'Sklep Online', ru: 'Интернет-магазин' },
      desc:    { en: uiCopy('u_c0d5084a79397ec6'), es: 'Vende productos online con soporte de sitio web y marketing.', pt: 'Venda produtos online com suporte de site e marketing.', pl: 'Sprzedawaj produkty online z wsparciem strony i marketingu.', ru: 'Продавайте товары онлайн с поддержкой сайта и маркетинга.' },
      previewTitle: { en: uiCopy('u_d6f0015fc5fc104e'), es: '🛒 Construye tu tienda online en 5 pasos', pt: '🛒 Construa sua loja online em 5 passos', pl: '🛒 Zbuduj sklep online w 5 krokach', ru: '🛒 Создайте интернет-магазин за 5 шагов' },
      href: uiCopy('u_28580c91f0991538'),
      steps: {
        s1: { en: uiCopy('u_8f7b830cf2108979'), es: 'Describe tus productos', pt: 'Descreva seus produtos', pl: 'Opisz swoje produkty', ru: 'Опишите ваши товары' },
        s2: { en: uiCopy('u_cae2012da46ace37'), es: 'Construye tu tienda', pt: 'Construa sua loja', pl: 'Zbuduj swój sklep', ru: 'Создайте витрину магазина' },
        s3: { en: uiCopy('u_b378eafae8b5b475'), es: 'Crea videos de productos', pt: 'Crie vídeos de produtos', pl: 'Twórz filmy o produktach', ru: 'Создайте видео о товарах' },
        s4: { en: uiCopy('u_6b42a2d18af337b1'), es: 'Recopila reseñas de productos', pt: 'Colete avaliações de produtos', pl: 'Zbieraj opinie o produktach', ru: 'Соберите отзывы о товарах' },
        s5: { en: uiCopy('u_84065a6517bdc1e5'), es: 'Lanza el marketing', pt: 'Lance o marketing', pl: 'Uruchom marketing', ru: 'Запустите маркетинг' },
      },
    },
  ],
  experiences: [
    {
      id: uiCopy('u_d802e3e12a2e1afb'), icon: '🌱',
      title: { en: uiCopy('u_d695035c54074bd6'), es: 'Guiado', pt: 'Guiado', pl: 'Guided', ru: 'С руководством' },
      desc:  { en: uiCopy('u_c8ad217ec6468259'), es: 'Mantenlo simple. Guíame por cada paso y ocúpate de las partes técnicas.', pt: 'Mantenha simples. Me guie por cada etapa e cuide das partes técnicas.', pl: 'Prosto. Przeprowadź mnie przez każdy krok i zajmij się częściami technicznymi.', ru: 'Просто. Проведите меня по каждому шагу и займитесь техническими частями.' },
    },
    {
      id: uiCopy('u_d4d6e47211a70e21'), icon: '⚙️',
      title: { en: uiCopy('u_0020e1d6c5e4923c'), es: 'Asistido', pt: 'Assistido', pl: 'Wspomagany', ru: 'С поддержкой' },
      desc:  { en: uiCopy('u_7fca68602307adfa'), es: 'Guíame, pero déjame tomar algunas decisiones por el camino.', pt: 'Me guie, mas deixe-me tomar algumas decisões ao longo do caminho.', pl: 'Prowadź mnie, ale pozwól mi podejmować niektóre decyzje.', ru: 'Ведите меня, но позвольте принимать некоторые решения.' },
    },
    {
      id: uiCopy('u_95c17ece2a4f9e61'), icon: '🚀',
      title: { en: uiCopy('u_fff1fff70f6a9189'), es: 'Usuario avanzado', pt: 'Usuário avançado', pl: 'Zaawansowany', ru: 'Опытный пользователь' },
      desc:  { en: uiCopy('u_f03a48f941bfd206'), es: 'Muestra opciones avanzadas y dame más control técnico.', pt: 'Mostre opções avançadas e me dê mais controle técnico.', pl: 'Pokaż zaawansowane opcje i daj mi więcej kontroli technicznej.', ru: 'Покажите расширенные параметры и дайте больше технического контроля.' },
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
