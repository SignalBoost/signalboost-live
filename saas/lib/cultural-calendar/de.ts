// saas/lib/cultural-calendar/de.ts
// German greetings + German holidays + day-of-week.
// Formal "Sie" register throughout.

import { GreetingContext, Greeting, pick, fill, inRange, easterSunday, nthWeekdayOfMonth, timeOfDay } from './helpers.ts'

export function germanGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Willkommen bei SignalBoost', 'Hallo, schön, dass Sie da sind', 'Willkommen']),
      subline:  pick([
        'Melden Sie sich an, um dort weiterzumachen, wo Sie aufgehört haben, oder starten Sie etwas Neues.',
        'Melden Sie sich an, um Ihre Projekte zu sehen.',
        'Melden Sie sich an und gestalten Sie weiter.',
      ]),
      emoji: '👋',
    }
  }

  // FEIERTAGE

  // Easter-relative offsets (days from Easter Sunday, UTC calendar days)
  const easter = easterSunday(year)
  const easterTime = Date.UTC(year, easter.month - 1, easter.day)
  const daysFromEaster = Math.round((Date.UTC(year, month - 1, day) - easterTime) / (24 * 60 * 60 * 1000))

  // Neujahr / Silvester (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        'Frohes neues Jahr, {name}!',
        'Ein guter Start ins neue Jahr, {name}!',
        'Prosit Neujahr, {name}!',
      ]), firstName),
      subline:  pick(['Möge das neue Jahr viele gute Projekte bringen.', 'Ein neues Kapitel beginnt. Was möchten Sie aufbauen?']),
      emoji: '✨',
    }
  }

  // Valentinstag (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill('Einen schönen Valentinstag, {name}', firstName),
      subline:  pick(['Ein Tag für die Menschen, die Ihnen am Herzen liegen.', 'Wir wünschen Ihnen einen herzlichen Tag.']),
      emoji: '💛',
    }
  }

  // Karneval / Fasching (Weiberfastnacht to Faschingsdienstag: Easter -52 .. -47)
  if (daysFromEaster >= -52 && daysFromEaster <= -47) {
    return {
      headline: fill(pick(['Helau und Alaaf, {name}!', 'Eine fröhliche Faschingszeit, {name}!']), firstName),
      subline:  pick(['Die fünfte Jahreszeit ist da.', 'Genießen Sie die närrischen Tage.']),
      emoji: '🎭',
    }
  }

  // Ostern (Karfreitag to Ostermontag: Easter -2 .. +1)
  if (daysFromEaster >= -2 && daysFromEaster <= 1) {
    return {
      headline: fill(pick(['Frohe Ostern, {name}!', 'Schöne Osterfeiertage, {name}']), firstName),
      subline:  pick(['Wir wünschen Ihnen erholsame Feiertage.', 'Genießen Sie die freien Tage.']),
      emoji: '🐣',
    }
  }

  // Tag der Arbeit (May 1)
  if (month === 5 && day === 1) {
    return {
      headline: fill('Einen schönen Tag der Arbeit, {name}', firstName),
      subline:  pick(['Ein Feiertag, um durchzuatmen.', 'Genießen Sie den freien Tag.']),
      emoji: '🛠️',
    }
  }

  // Muttertag (2nd Sunday of May)
  if (month === 5 && day === nthWeekdayOfMonth(year, 5, 0, 2)) {
    return {
      headline: fill('Alles Gute zum Muttertag, {name}', firstName),
      subline:  pick(['Ein Tag für alle Mütter. Wenn Sie Mutter sind: herzlichen Glückwunsch!', 'Danke an alle Mütter.']),
      emoji: '💐',
    }
  }

  // Pfingsten (Pfingstsonntag & Pfingstmontag: Easter +49 .. +50)
  if (daysFromEaster === 49 || daysFromEaster === 50) {
    return {
      headline: fill('Frohe Pfingsten, {name}', firstName),
      subline:  pick(['Wir wünschen Ihnen ein erholsames Pfingstwochenende.', 'Genießen Sie die Feiertage.']),
      emoji: '🌿',
    }
  }

  // Tag der Deutschen Einheit (Oct 3)
  if (month === 10 && day === 3) {
    return {
      headline: fill('Einen schönen Tag der Deutschen Einheit, {name}', firstName),
      subline:  pick(['Ein Feiertag für ganz Deutschland.', 'Genießen Sie den freien Tag.']),
      emoji: '🇩🇪',
    }
  }

  // Nikolaustag (Dec 6)
  if (month === 12 && day === 6) {
    return {
      headline: fill('Einen schönen Nikolaustag, {name}', firstName),
      subline:  pick(['Hoffentlich war etwas Süßes im Stiefel.', 'Die Adventszeit ist in vollem Gange.']),
      emoji: '🎅',
    }
  }

  // Weihnachten (Dec 20-26)
  if (month === 12 && day >= 20 && day <= 26) {
    return {
      headline: fill(pick(['Frohe Weihnachten, {name}!', 'Schöne Feiertage, {name}']), firstName),
      subline:  pick(['Wir wünschen Ihnen besinnliche Tage mit Ihren Liebsten.', 'Genießen Sie die ruhige Zeit.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Willkommen bei SignalBoost, {name}!',
        'Schön, dass Sie da sind, {name}',
        'Hallo und willkommen, {name}',
      ]), firstName),
      subline:  pick([
        'Erzählen Sie mir von Ihrem Unternehmen, und ich helfe Ihnen beim Start.',
        'Wir fangen ganz neu an. Was möchten Sie erstellen?',
        'Fragen Sie mich etwas oder erstellen Sie Ihr erstes Projekt.',
      ]),
      emoji: '🎉',
    }
  }

  // TAGESZEIT — Standardgruß nach der Ortszeit des Nutzers
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? ' Genießen Sie Ihr Wochenende.' : ''
  const mondayFlavor  = (dow === 1) ? ' Eine neue Woche beginnt.' : ''
  const fridayFlavor  = (dow === 5) ? ' Das Wochenende ist fast da.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['Guten Morgen, {name}', 'Einen guten Morgen, {name}', 'Moin, {name}']), firstName),
      subline:  pick(['Bereit für den Tag?', 'Woran arbeiten wir heute Morgen?', 'Ich hoffe, Sie haben gut geschlafen.']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['Guten Tag, {name}', 'Hallo, {name}', 'Willkommen zurück, {name}']), firstName),
      subline:  pick(['Woran arbeiten wir heute?', 'Ich hoffe, Ihr Tag läuft gut.', 'Bereit, wann immer Sie es sind.']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['Guten Abend, {name}', 'Einen schönen Abend, {name}', 'Willkommen zurück, {name}']), firstName),
      subline:  pick(['Lassen Sie den Tag ausklingen oder fangen Sie gerade erst an?', 'Wobei kann ich Ihnen heute Abend helfen?', 'Schön, dass Sie vorbeischauen.']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // späte Nacht (22-04)
  return {
    headline: fill(pick(['Noch spät bei der Arbeit, {name}?', 'Noch wach, {name}?', 'Hallo, {name}']), firstName),
    subline:  pick(['Kein Urteil. Was bauen wir?', 'Die besten Ideen kommen oft nachts.', 'Ich bin da, wann immer Sie mich brauchen.']),
    emoji: '🌙',
  }
}
