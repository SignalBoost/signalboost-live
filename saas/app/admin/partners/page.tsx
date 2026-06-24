'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

function getLang(): Lang {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language.slice(0, 2)
  if (l === 'es') return 'es'
  if (l === 'pt') return 'pt'
  if (l === 'pl') return 'pl'
  if (l === 'ru') return 'ru'
  return 'en'
}

const COPY = {
  en: {
    eyebrow: 'Partners',
    heading: 'Organized by what the traveler needs next.',
    intro: 'Instead of one flat partner list, this console groups supply by human intent: getting there, staying there, connecting, feeling protected, and doing something memorable.',
    reviewBtn: 'Review partners',
    perfTitle: 'Partner performance by intent',
    perfCaption: 'Filters: date range • country • user intent • partner category',
    addBtn: 'Add partner',
    colIntent: 'Intent',
    colPartner: 'Partner',
    colClicks: 'Clicks',
    colStatus: 'Status',
    empty: 'Not tracked yet. Connect partner click analytics to populate this organized view.',
    intents: [
      ['Flights', 'Help travelers get there first.', 'Compare flight offers, regional carriers, and urgency-based travel promos.'],
      ['Hotels', 'Give them a safe place to land.', 'Surface lodging partners by budget, location, cancellation flexibility, and trust.'],
      ['SIM Cards', 'Keep customers connected on arrival.', 'Prioritize eSIM/SIM partners with country fit, setup clarity, and support quality.'],
      ['Insurance', 'Reduce travel anxiety.', 'Group medical, trip, and gear protection around confidence and compliance.'],
      ['Activities', 'Turn arrival into an experience.', 'Recommend tours, events, dining, and local experiences by intent and region.'],
    ],
  },
  es: {
    eyebrow: 'Socios',
    heading: 'Organizado según lo que el viajero necesita a continuación.',
    intro: 'En lugar de una lista plana de socios, esta consola agrupa la oferta por intención humana: llegar, alojarse, conectarse, sentirse protegido y vivir algo memorable.',
    reviewBtn: 'Ver socios',
    perfTitle: 'Rendimiento de socios por intención',
    perfCaption: 'Filtros: rango de fechas • país • intención del usuario • categoría de socio',
    addBtn: 'Agregar socio',
    colIntent: 'Intención',
    colPartner: 'Socio',
    colClicks: 'Clics',
    colStatus: 'Estado',
    empty: 'Aún sin datos. Conecta el análisis de clics de socios para poblar esta vista.',
    intents: [
      ['Vuelos', 'Ayuda a los viajeros a llegar primero.', 'Compara ofertas de vuelos, aerolíneas regionales y promociones de viaje urgentes.'],
      ['Hoteles', 'Dales un lugar seguro donde aterrizar.', 'Muestra socios de alojamiento por presupuesto, ubicación, flexibilidad de cancelación y confianza.'],
      ['SIM Cards', 'Mantén a los clientes conectados al llegar.', 'Prioriza socios eSIM/SIM con adecuación al país, claridad de configuración y calidad de soporte.'],
      ['Seguros', 'Reduce la ansiedad del viaje.', 'Agrupa protección médica, de viaje y de equipaje en torno a la confianza y el cumplimiento.'],
      ['Actividades', 'Convierte la llegada en una experiencia.', 'Recomienda tours, eventos, gastronomía y experiencias locales por intención y región.'],
    ],
  },
  pt: {
    eyebrow: 'Parceiros',
    heading: 'Organizado pelo que o viajante precisa a seguir.',
    intro: 'Em vez de uma lista plana de parceiros, este console agrupa a oferta por intenção humana: chegar lá, ficar lá, conectar-se, sentir-se protegido e fazer algo memorável.',
    reviewBtn: 'Ver parceiros',
    perfTitle: 'Desempenho de parceiros por intenção',
    perfCaption: 'Filtros: intervalo de datas • país • intenção do usuário • categoria de parceiro',
    addBtn: 'Adicionar parceiro',
    colIntent: 'Intenção',
    colPartner: 'Parceiro',
    colClicks: 'Cliques',
    colStatus: 'Status',
    empty: 'Ainda sem dados. Conecte a análise de cliques de parceiros para preencher esta visualização.',
    intents: [
      ['Voos', 'Ajude os viajantes a chegar primeiro.', 'Compare ofertas de voos, companhias regionais e promoções de viagem urgentes.'],
      ['Hotéis', 'Dê a eles um lugar seguro para pousar.', 'Mostre parceiros de hospedagem por orçamento, localização, flexibilidade de cancelamento e confiança.'],
      ['SIM Cards', 'Mantenha os clientes conectados ao chegar.', 'Priorize parceiros eSIM/SIM com adequação ao país, clareza de configuração e qualidade de suporte.'],
      ['Seguros', 'Reduza a ansiedade de viagem.', 'Agrupe proteção médica, de viagem e de equipamentos em torno de confiança e conformidade.'],
      ['Atividades', 'Transforme a chegada em uma experiência.', 'Recomende passeios, eventos, gastronomia e experiências locais por intenção e região.'],
    ],
  },
  pl: {
    eyebrow: 'Partnerzy',
    heading: 'Zorganizowane według tego, czego podróżnik potrzebuje dalej.',
    intro: 'Zamiast jednej płaskiej listy partnerów, ta konsola grupuje ofertę według ludzkiej intencji: dotrzeć tam, zostać, połączyć się, poczuć się bezpiecznie i przeżyć coś niezapomnianego.',
    reviewBtn: 'Przejrzyj partnerów',
    perfTitle: 'Wyniki partnerów według intencji',
    perfCaption: 'Filtry: zakres dat • kraj • intencja użytkownika • kategoria partnera',
    addBtn: 'Dodaj partnera',
    colIntent: 'Intencja',
    colPartner: 'Partner',
    colClicks: 'Kliknięcia',
    colStatus: 'Status',
    empty: 'Brak danych. Podłącz analitykę kliknięć partnerów, aby wypełnić ten widok.',
    intents: [
      ['Loty', 'Pomóż podróżnikom dotrzeć na miejsce jako pierwsi.', 'Porównaj oferty lotów, regionalnych przewoźników i pilne promocje podróżne.'],
      ['Hotele', 'Daj im bezpieczne miejsce do lądowania.', 'Pokaż partnerów noclegowych według budżetu, lokalizacji, elastyczności anulowania i zaufania.'],
      ['Karty SIM', 'Utrzymaj klientów w kontakcie po przylocie.', 'Priorytetyzuj partnerów eSIM/SIM pod kątem dopasowania do kraju, jasności konfiguracji i jakości wsparcia.'],
      ['Ubezpieczenia', 'Zmniejsz lęk przed podróżą.', 'Grupuj ochronę medyczną, podróżną i sprzętową wokół pewności i zgodności.'],
      ['Aktywności', 'Zamień przybycie w doświadczenie.', 'Polecaj wycieczki, wydarzenia, restauracje i lokalne doświadczenia według intencji i regionu.'],
    ],
  },
  ru: {
    eyebrow: 'Партнёры',
    heading: 'Организовано по тому, что нужно путешественнику дальше.',
    intro: 'Вместо единого плоского списка партнёров эта консоль группирует предложения по человеческому намерению: добраться туда, остановиться, оставаться на связи, чувствовать себя защищённым и получить незабываемые впечатления.',
    reviewBtn: 'Просмотр партнёров',
    perfTitle: 'Эффективность партнёров по намерению',
    perfCaption: 'Фильтры: диапазон дат • страна • намерение пользователя • категория партнёра',
    addBtn: 'Добавить партнёра',
    colIntent: 'Намерение',
    colPartner: 'Партнёр',
    colClicks: 'Клики',
    colStatus: 'Статус',
    empty: 'Данных пока нет. Подключите аналитику кликов партнёров, чтобы заполнить этот вид.',
    intents: [
      ['Авиабилеты', 'Помогите путешественникам добраться первыми.', 'Сравнивайте предложения авиабилетов, региональных перевозчиков и срочные туристические акции.'],
      ['Отели', 'Дайте им безопасное место для посадки.', 'Показывайте партнёров по размещению по бюджету, местоположению, гибкости отмены и доверию.'],
      ['SIM-карты', 'Держите клиентов на связи по прибытии.', 'Приоритизируйте партнёров eSIM/SIM по соответствию стране, ясности настройки и качеству поддержки.'],
      ['Страхование', 'Снизьте тревогу от путешествий.', 'Группируйте медицинскую, туристическую и имущественную защиту вокруг уверенности и соответствия.'],
      ['Активности', 'Превратите прибытие в впечатление.', 'Рекомендуйте туры, мероприятия, рестораны и местные впечатления по намерению и региону.'],
    ],
  },
}

export default function PartnersPage() {
  const { lang: activeLang } = useI18n()
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    setLang(getLang())
  }, [])

  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '16px',
        padding: '24px',
      }}>
        <span className="sb-eyebrow">{c.eyebrow}</span>
        <h1 className="sb-h2" style={{ marginTop: '12px' }}>{c.heading}</h1>
        <p className="sb-body" style={{ maxWidth: '720px' }}>{c.intro}</p>
      </section>

      {/* Intent cards */}
      <section style={{
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      }}>
        {c.intents.map(([title, prompt, detail]) => (
          <article key={title} style={{
            background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <span className="sb-eyebrow">{title}</span>
            <h2 className="sb-h3" style={{ marginTop: '4px' }}>{prompt}</h2>
            <p className="sb-body" style={{ fontSize: '13px', flex: 1 }}>{detail}</p>
          </article>
        ))}
      </section>

      {/* Performance table */}
      <section style={{
        background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,.1)',
          padding: '20px',
        }}>
          <div>
            <h2 className="sb-h3">{c.perfTitle}</h2>
            <p className="sb-caption">{c.perfCaption}</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.6)' }}>
              <tr>
                <th style={{ padding: '12px 20px' }}>{c.colIntent}</th>
                <th style={{ padding: '12px 20px' }}>{c.colPartner}</th>
                <th style={{ padding: '12px 20px' }}>{c.colClicks}</th>
                <th style={{ padding: '12px 20px' }}>{c.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
                <td style={{ padding: '24px 20px', color: 'rgba(255,255,255,.4)' }} colSpan={4}>
                  {c.empty}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
