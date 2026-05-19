// saas/lib/cultural-calendar/pt.ts
// Portuguese greetings - Brazilian Portuguese leaning, with PT-PT acceptable phrasing.

import { GreetingContext, Greeting, pick, fill, inRange, carnavalRange } from './helpers'

export function portugueseGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Bem-vindo ao SignalBoost', 'Olá, que bom te ver', 'Bem-vindo']),
      subline:  pick([
        'Faça login para continuar de onde parou, ou comece algo novo.',
        'Faça login para ver seus projetos.',
        'Entre para continuar criando.',
      ]),
      emoji: '👋',
    }
  }

  // HOLIDAYS

  // Ano Novo
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        'Feliz Ano Novo, {name}!',
        'Um novo começo, {name}',
        'Próspero ano, {name}!',
      ]), firstName),
      subline:  pick(['Que este ano traga bons projetos.', 'Vamos começar de novo. O que quer construir?']),
      emoji: '✨',
    }
  }

  // Dia dos Namorados (Brazil: June 12)
  if (month === 6 && day === 12) {
    return {
      headline: fill('Feliz Dia dos Namorados, {name}', firstName),
      subline:  pick(['Um dia para celebrar quem você ama.', 'Que seja um dia cheio de carinho.']),
      emoji: '💛',
    }
  }

  // Carnaval (movable - based on Easter)
  const carnaval = carnavalRange(year)
  if (inRange(month, day, carnaval.startMonth, carnaval.startDay, carnaval.endMonth, carnaval.endDay)) {
    return {
      headline: fill(pick(['Bom Carnaval, {name}!', 'Feliz Carnaval, {name}!', 'É Carnaval, {name}!']), firstName),
      subline:  pick(['Aproveite os dias de festa.', 'Espero que esteja se divertindo bastante.', 'Os trabalhos podem esperar — é Carnaval!']),
      emoji: '🎭',
    }
  }

  // Festa Junina (June - peak around São João, June 24)
  if (month === 6 && day >= 12 && day <= 29) {
    return {
      headline: fill(pick(['Arraiá, {name}!', 'Boa Festa Junina, {name}', 'É junho, {name}!']), firstName),
      subline:  pick([
        'Espero que esteja aproveitando as festas juninas.',
        'Quentão, pé-de-moleque e muita música — boa época.',
        'Olha o São João chegando!',
      ]),
      emoji: '🌽',
    }
  }

  // Dia das Mães (Brazil: 2nd Sunday of May)
  // Calculate 2nd Sunday of May for this year
  const may1 = new Date(Date.UTC(year, 4, 1)) // May 1
  const may1Dow = may1.getUTCDay()
  const firstSunday = 1 + ((7 - may1Dow) % 7)
  const mothersDayBR = firstSunday + 7
  if (month === 5 && day === mothersDayBR) {
    return {
      headline: fill(pick(['Feliz Dia das Mães, {name}!', 'Feliz Dia da Mãe, {name}']), firstName),
      subline:  pick(['Um dia especial para todas as mães. Se você é mãe, parabéns!', 'Para todas as mães de hoje.']),
      emoji: '💐',
    }
  }

  // Dia dos Pais (Brazil: 2nd Sunday of August)
  const aug1 = new Date(Date.UTC(year, 7, 1))
  const aug1Dow = aug1.getUTCDay()
  const firstSundayAug = 1 + ((7 - aug1Dow) % 7)
  const fathersDayBR = firstSundayAug + 7
  if (month === 8 && day === fathersDayBR) {
    return {
      headline: fill('Feliz Dia dos Pais, {name}', firstName),
      subline:  pick(['Para todos os pais. Se você é pai, parabéns!', 'Um dia especial para celebrar.']),
      emoji: '👨‍👧',
    }
  }

  // Independência do Brasil (Sept 7)
  if (month === 9 && day === 7) {
    return {
      headline: fill(pick(['Feliz Dia da Independência, {name}!', 'Independência do Brasil, {name}!']), firstName),
      subline:  pick(['7 de setembro — dia da pátria.', 'Um feriado pra descansar e celebrar.']),
      emoji: '🇧🇷',
    }
  }

  // Dia das Crianças (Brazil: Oct 12)
  if (month === 10 && day === 12) {
    return {
      headline: fill('Feliz Dia das Crianças, {name}', firstName),
      subline:  pick(['Para todas as crianças — e os pais que estão de folga hoje.', 'Um dia para celebrar a infância.']),
      emoji: '🎈',
    }
  }

  // Finados (Nov 2)
  if (month === 11 && day === 2) {
    return {
      headline: fill('Dia de Finados, {name}', firstName),
      subline:  'Um dia para lembrar de quem já se foi.',
      emoji: '🕯️',
    }
  }

  // Natal (Dec 20-26)
  if (month === 12 && day >= 20 && day <= 26) {
    return {
      headline: fill(pick(['Feliz Natal, {name}!', 'Boas festas, {name}']), firstName),
      subline:  pick(['Espero que esteja com a família.', 'Que sejam dias de paz e alegria.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Bem-vindo ao SignalBoost, {name}!',
        'Que bom ter você aqui, {name}',
        'Olá, {name} — seja bem-vindo',
      ]), firstName),
      subline:  pick([
        'Me conta sobre o seu negócio e eu te ajudo a começar.',
        'Começo do zero. O que você quer criar?',
        'Pergunta o que quiser, ou cria seu primeiro projeto.',
      ]),
      emoji: '🎉',
    }
  }

  // DAY OF WEEK
  if (dow === 6 || dow === 0) {
    return {
      headline: fill(pick(['Bom fim de semana, {name}', 'Trabalhando no fim de semana, {name}?', 'Olá de novo, {name}']), firstName),
      subline:  pick(['Sem pressa.', 'Que bom te ver aqui.']),
      emoji: '👋',
    }
  }
  if (dow === 1) {
    return {
      headline: fill(pick(['Bom segunda, {name}', 'Boa semana, {name}', 'Olá de novo, {name}']), firstName),
      subline:  pick(['Semana nova, possibilidades novas.', 'Por onde quer começar?']),
      emoji: '☕',
    }
  }
  if (dow === 5) {
    return {
      headline: fill(pick(['Feliz sexta, {name}', 'Sexta-feira, {name}!', 'Olá de novo, {name}']), firstName),
      subline:  pick(['Quase fim de semana.', 'O que quer terminar antes do fim de semana?']),
      emoji: '🌅',
    }
  }

  // DEFAULT (Tue/Wed/Thu)
  return {
    headline: fill(pick(['Bem-vindo de volta, {name}', 'Que bom te ver, {name}', 'Olá, {name}']), firstName),
    subline:  pick([
      'Pergunte o que quiser ou continue de onde parou.',
      'No que vamos trabalhar hoje?',
      'Pronto quando você estiver.',
    ]),
    emoji: '👋',
  }
}
