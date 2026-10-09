// saas/lib/cultural-calendar/it.ts
// Italian greetings + Italian holidays + day-of-week.
// Friendly "tu" register throughout.

import { GreetingContext, Greeting, pick, fill, inRange, easterSunday, nthWeekdayOfMonth, timeOfDay } from './helpers.ts'

export function italianGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Benvenuto su SignalBoost', 'Ciao, che piacere vederti', 'Benvenuto']),
      subline:  pick([
        'Accedi per riprendere da dove avevi lasciato, o inizia qualcosa di nuovo.',
        'Accedi per vedere i tuoi progetti.',
        'Accedi per continuare a creare.',
      ]),
      emoji: '👋',
    }
  }

  // FESTIVITÀ

  // Easter-relative offsets (days from Easter Sunday, UTC calendar days)
  const easter = easterSunday(year)
  const easterTime = Date.UTC(year, easter.month - 1, easter.day)
  const daysFromEaster = Math.round((Date.UTC(year, month - 1, day) - easterTime) / (24 * 60 * 60 * 1000))

  // Capodanno (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        'Buon anno, {name}!',
        'Felice anno nuovo, {name}!',
        'Un nuovo inizio, {name}!',
      ]), firstName),
      subline:  pick(['Che quest’anno porti tanti bei progetti.', 'Si riparte. Cosa vuoi costruire?']),
      emoji: '✨',
    }
  }

  // Epifania / Befana (Jan 6)
  if (month === 1 && day === 6) {
    return {
      headline: fill(pick(['Buona Epifania, {name}!', 'Buona Befana, {name}!']), firstName),
      subline:  pick(['Speriamo che la Befana ti abbia portato dolci e non carbone.', 'L’Epifania tutte le feste porta via.']),
      emoji: '🧹',
    }
  }

  // San Valentino (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill('Buon San Valentino, {name}', firstName),
      subline:  pick(['Una giornata per le persone a cui vuoi bene.', 'Che sia una giornata piena di affetto.']),
      emoji: '💛',
    }
  }

  // Carnevale (Giovedì grasso to Martedì grasso: Easter -52 .. -47)
  if (daysFromEaster >= -52 && daysFromEaster <= -47) {
    return {
      headline: fill(pick(['Buon Carnevale, {name}!', 'A Carnevale ogni scherzo vale, {name}!']), firstName),
      subline:  pick(['Maschere, coriandoli e chiacchiere.', 'Goditi i giorni di festa.']),
      emoji: '🎭',
    }
  }

  // Pasqua e Pasquetta (Easter Sunday & Monday: 0 .. +1)
  if (daysFromEaster === 0 || daysFromEaster === 1) {
    return {
      headline: fill(pick(['Buona Pasqua, {name}!', 'Buona Pasquetta, {name}!']), firstName),
      subline:  pick(['Ti auguriamo giorni sereni.', 'Goditi la festa con le persone care.']),
      emoji: '🐣',
    }
  }

  // Festa della Liberazione (Apr 25)
  if (month === 4 && day === 25) {
    return {
      headline: fill('Buona Festa della Liberazione, {name}', firstName),
      subline:  pick(['Un giorno per ricordare e celebrare la libertà.', 'Goditi la giornata di festa.']),
      emoji: '🇮🇹',
    }
  }

  // Festa dei Lavoratori (May 1)
  if (month === 5 && day === 1) {
    return {
      headline: fill('Buon Primo Maggio, {name}', firstName),
      subline:  pick(['Un giorno per riposare e celebrare il lavoro di tutti.', 'Goditi la festa.']),
      emoji: '🛠️',
    }
  }

  // Festa della Mamma (2nd Sunday of May)
  if (month === 5 && day === nthWeekdayOfMonth(year, 5, 0, 2)) {
    return {
      headline: fill('Buona Festa della Mamma, {name}', firstName),
      subline:  pick(['Una giornata speciale per tutte le mamme. Se sei mamma, auguri!', 'Per tutte le mamme di oggi.']),
      emoji: '💐',
    }
  }

  // Festa della Repubblica (Jun 2)
  if (month === 6 && day === 2) {
    return {
      headline: fill('Buona Festa della Repubblica, {name}', firstName),
      subline:  pick(['Auguri all’Italia!', 'Goditi la giornata di festa.']),
      emoji: '🇮🇹',
    }
  }

  // Ferragosto (Aug 15)
  if (month === 8 && day === 15) {
    return {
      headline: fill('Buon Ferragosto, {name}!', firstName),
      subline:  pick(['Spero che tu sia al mare o in montagna.', 'Il cuore dell’estate italiana.']),
      emoji: '🏖️',
    }
  }

  // Ognissanti (Nov 1)
  if (month === 11 && day === 1) {
    return {
      headline: fill('Buon Ognissanti, {name}', firstName),
      subline:  pick(['Una giornata di riposo e di ricordo.', 'Goditi la festa.']),
      emoji: '🍂',
    }
  }

  // Immacolata Concezione (Dec 8)
  if (month === 12 && day === 8) {
    return {
      headline: fill('Buona festa dell’Immacolata, {name}', firstName),
      subline:  pick(['È il giorno in cui si fa l’albero di Natale.', 'Inizia l’atmosfera natalizia.']),
      emoji: '🌟',
    }
  }

  // Natale e Santo Stefano (Dec 20-26)
  if (month === 12 && day >= 20 && day <= 26) {
    return {
      headline: fill(pick(['Buon Natale, {name}!', 'Buone feste, {name}']), firstName),
      subline:  pick(['Spero che tu sia con la tua famiglia.', 'Ti auguriamo giorni pieni di serenità.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Benvenuto su SignalBoost, {name}!',
        'Che bello averti qui, {name}',
        'Ciao e benvenuto, {name}',
      ]), firstName),
      subline:  pick([
        'Raccontami della tua attività e ti aiuto a iniziare.',
        'Partiamo da zero. Cosa vuoi creare?',
        'Chiedimi qualsiasi cosa o crea il tuo primo progetto.',
      ]),
      emoji: '🎉',
    }
  }

  // MOMENTO DELLA GIORNATA — saluto predefinito secondo l’ora locale
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? ' Buon fine settimana.' : ''
  const mondayFlavor  = (dow === 1) ? ' Inizia una nuova settimana.' : ''
  const fridayFlavor  = (dow === 5) ? ' Il fine settimana è quasi arrivato.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['Buongiorno, {name}', 'Buona giornata, {name}', 'Buongiorno, {name}']), firstName),
      subline:  pick(['Pronto per iniziare la giornata?', 'Su cosa lavoriamo stamattina?', 'Spero che tu abbia riposato bene.']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['Buon pomeriggio, {name}', 'Ciao, {name}', 'Bentornato, {name}']), firstName),
      subline:  pick(['Su cosa lavoriamo oggi?', 'Spero che la tua giornata stia andando bene.', 'Pronto quando lo sei tu.']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['Buonasera, {name}', 'Buona serata, {name}', 'Bentornato, {name}']), firstName),
      subline:  pick(['Stai chiudendo la giornata o hai appena iniziato?', 'Come posso aiutarti stasera?', 'Che bello che sei passato.']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // notte fonda (22-04)
  return {
    headline: fill(pick(['Lavori fino a tardi, {name}?', 'Ancora sveglio, {name}?', 'Ciao, {name}']), firstName),
    subline:  pick(['Nessun giudizio. Cosa stiamo costruendo?', 'Le idee migliori arrivano di notte.', 'Sono qui quando hai bisogno.']),
    emoji: '🌙',
  }
}
