// saas/lib/cultural-calendar/fr.ts
// French greetings + French holidays + day-of-week.
// Formal "vous" register throughout.

import { GreetingContext, Greeting, pick, fill, inRange, easterSunday, nthWeekdayOfMonth, lastWeekdayOfMonth, timeOfDay } from './helpers.ts'

export function frenchGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Bienvenue sur SignalBoost', 'Bonjour, ravi de vous voir', 'Bienvenue']),
      subline:  pick([
        'Connectez-vous pour reprendre là où vous en étiez, ou commencez quelque chose de nouveau.',
        'Connectez-vous pour voir vos projets.',
        'Connectez-vous pour continuer à créer.',
      ]),
      emoji: '👋',
    }
  }

  // JOURS FÉRIÉS ET FÊTES

  // Easter-relative offsets (days from Easter Sunday, UTC calendar days)
  const easter = easterSunday(year)
  const easterTime = Date.UTC(year, easter.month - 1, easter.day)
  const dayMs = 24 * 60 * 60 * 1000
  const daysFromEaster = Math.round((Date.UTC(year, month - 1, day) - easterTime) / dayMs)

  // Nouvel An (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        'Bonne année, {name} !',
        'Meilleurs vœux, {name} !',
        'Une nouvelle année commence, {name} !',
      ]), firstName),
      subline:  pick(['Que cette année vous apporte de beaux projets.', 'Une page blanche s’ouvre. Que souhaitez-vous construire ?']),
      emoji: '✨',
    }
  }

  // Épiphanie (Jan 6)
  if (month === 1 && day === 6) {
    return {
      headline: fill('Bonne Épiphanie, {name} !', firstName),
      subline:  pick(['Avez-vous trouvé la fève dans la galette ?', 'C’est le jour de la galette des rois.']),
      emoji: '👑',
    }
  }

  // Chandeleur (Feb 2)
  if (month === 2 && day === 2) {
    return {
      headline: fill('Bonne Chandeleur, {name} !', firstName),
      subline:  pick(['Une journée parfaite pour des crêpes.', 'Avez-vous déjà fait sauter vos crêpes ?']),
      emoji: '🥞',
    }
  }

  // Saint-Valentin (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill('Joyeuse Saint-Valentin, {name}', firstName),
      subline:  pick(['Une journée pour celles et ceux qui vous sont chers.', 'Belle journée remplie de tendresse.']),
      emoji: '💛',
    }
  }

  // Pâques (Easter Sunday & Lundi de Pâques: 0 .. +1)
  if (daysFromEaster === 0 || daysFromEaster === 1) {
    return {
      headline: fill(pick(['Joyeuses Pâques, {name} !', 'Bonnes fêtes de Pâques, {name}']), firstName),
      subline:  pick(['Nous vous souhaitons un week-end reposant.', 'Profitez bien de ces jours de fête.']),
      emoji: '🐣',
    }
  }

  // Fête du Travail (May 1)
  if (month === 5 && day === 1) {
    return {
      headline: fill('Bonne fête du Travail, {name}', firstName),
      subline:  pick(['Un brin de muguet pour vous porter bonheur.', 'Profitez de ce jour férié.']),
      emoji: '🌱',
    }
  }

  // Victoire 1945 (May 8)
  if (month === 5 && day === 8) {
    return {
      headline: fill('Bonjour, {name}', firstName),
      subline:  pick(['Aujourd’hui, la France commémore la Victoire du 8 mai 1945.', 'Un jour de mémoire et de paix.']),
      emoji: '🕊️',
    }
  }

  // Fête des Mères (last Sunday of May; first Sunday of June when it coincides with Pentecost)
  const pentecost = new Date(easterTime + 49 * dayMs)
  const lastSundayMay = lastWeekdayOfMonth(year, 5, 0)
  const pentecostOnLastSundayMay = pentecost.getUTCMonth() + 1 === 5 && pentecost.getUTCDate() === lastSundayMay
  const isMothersDay = pentecostOnLastSundayMay
    ? (month === 6 && day === nthWeekdayOfMonth(year, 6, 0, 1))
    : (month === 5 && day === lastSundayMay)
  if (isMothersDay) {
    return {
      headline: fill('Bonne fête des Mères, {name}', firstName),
      subline:  pick(['Une journée pour toutes les mamans. Si vous êtes maman, bonne fête !', 'Pour toutes les mères aujourd’hui.']),
      emoji: '💐',
    }
  }

  // Fête de la Musique (Jun 21)
  if (month === 6 && day === 21) {
    return {
      headline: fill('Bonne fête de la Musique, {name} !', firstName),
      subline:  pick(['La musique est dans toutes les rues ce soir.', 'Le plus long jour de l’année, en musique.']),
      emoji: '🎶',
    }
  }

  // Fête nationale (Jul 14)
  if (month === 7 && day === 14) {
    return {
      headline: fill('Bonne fête nationale, {name} !', firstName),
      subline:  pick(['Bon 14 Juillet et beau feu d’artifice.', 'Profitez de ce jour de fête.']),
      emoji: '🇫🇷',
    }
  }

  // Assomption (Aug 15)
  if (month === 8 && day === 15) {
    return {
      headline: fill('Bon 15 août, {name}', firstName),
      subline:  pick(['Profitez de ce jour férié au cœur de l’été.', 'Bel été à vous.']),
      emoji: '☀️',
    }
  }

  // Toussaint (Nov 1)
  if (month === 11 && day === 1) {
    return {
      headline: fill('Bonne Toussaint, {name}', firstName),
      subline:  pick(['Un jour pour penser à celles et ceux qui nous sont chers.', 'Profitez de ce jour de repos.']),
      emoji: '🍂',
    }
  }

  // Armistice (Nov 11)
  if (month === 11 && day === 11) {
    return {
      headline: fill('Bonjour, {name}', firstName),
      subline:  pick(['Aujourd’hui, la France commémore l’Armistice de 1918.', 'Un jour de mémoire.']),
      emoji: '🕊️',
    }
  }

  // Noël (Dec 20-26)
  if (month === 12 && day >= 20 && day <= 26) {
    return {
      headline: fill(pick(['Joyeux Noël, {name} !', 'Bonnes fêtes, {name}']), firstName),
      subline:  pick(['Nous vous souhaitons de beaux moments en famille.', 'Que ces jours soient remplis de douceur.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Bienvenue sur SignalBoost, {name} !',
        'Ravi de vous accueillir, {name}',
        'Bonjour et bienvenue, {name}',
      ]), firstName),
      subline:  pick([
        'Parlez-moi de votre entreprise et je vous aide à démarrer.',
        'On part de zéro. Que souhaitez-vous créer ?',
        'Posez-moi une question ou créez votre premier projet.',
      ]),
      emoji: '🎉',
    }
  }

  // MOMENT DE LA JOURNÉE — salutation par défaut selon l’heure locale
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? ' Bon week-end à vous.' : ''
  const mondayFlavor  = (dow === 1) ? ' Une nouvelle semaine commence.' : ''
  const fridayFlavor  = (dow === 5) ? ' Le week-end approche.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['Bonjour, {name}', 'Bonne matinée, {name}', 'Bonjour, {name}']), firstName),
      subline:  pick(['Prêt à commencer la journée ?', 'Sur quoi travaillons-nous ce matin ?', 'J’espère que vous avez bien dormi.']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['Bon après-midi, {name}', 'Bonjour, {name}', 'Bon retour, {name}']), firstName),
      subline:  pick(['Sur quoi travaillons-nous aujourd’hui ?', 'J’espère que votre journée se passe bien.', 'Prêt dès que vous l’êtes.']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['Bonsoir, {name}', 'Bonne soirée, {name}', 'Bon retour, {name}']), firstName),
      subline:  pick(['Vous terminez la journée ou vous commencez à peine ?', 'Comment puis-je vous aider ce soir ?', 'Ravi de vous voir passer.']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // tard dans la nuit (22-04)
  return {
    headline: fill(pick(['Vous travaillez tard, {name} ?', 'Encore debout, {name} ?', 'Bonsoir, {name}']), firstName),
    subline:  pick(['Aucun jugement. Que construisons-nous ?', 'Les meilleures idées arrivent souvent la nuit.', 'Je suis là quand vous avez besoin de moi.']),
    emoji: '🌙',
  }
}
