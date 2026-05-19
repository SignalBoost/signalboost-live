// saas/lib/cultural-calendar/es.ts
// Spanish greetings + Latin American / Iberian holidays + day-of-week.
// Phrasing kept standard / neutral Latin American Spanish.

import { GreetingContext, Greeting, pick, fill, inRange, easterSunday } from './helpers'

export function spanishGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Bienvenido a SignalBoost', 'Hola, qué bueno verte', 'Bienvenido']),
      subline:  pick([
        'Inicia sesión para continuar donde lo dejaste, o empieza algo nuevo.',
        'Inicia sesión para ver tus proyectos.',
        'Entra para seguir creando.',
      ]),
      emoji: '👋',
    }
  }

  // HOLIDAYS

  // Año Nuevo (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        '¡Feliz Año Nuevo, {name}!',
        'Un nuevo comienzo, {name}',
        '¡Próspero año, {name}!',
      ]), firstName),
      subline:  pick(['Que este año traiga buenos proyectos.', 'Empezamos de nuevo. ¿Qué quieres construir?']),
      emoji: '✨',
    }
  }

  // Día de Reyes (Jan 6) — huge in Spain and parts of Latin America
  if (month === 1 && day === 6) {
    return {
      headline: fill(pick(['¡Feliz Día de Reyes, {name}!', 'Día de Reyes, {name}']), firstName),
      subline:  pick(['Esperamos que los Reyes Magos hayan sido generosos.', '¿Encontraste tu regalo hoy?']),
      emoji: '👑',
    }
  }

  // San Valentín / Día del Amor y la Amistad (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill(pick(['Feliz Día del Amor y la Amistad, {name}', 'Feliz San Valentín, {name}']), firstName),
      subline:  pick(['Un día para celebrar a quien quieres.', 'Que sea un día lleno de cariño.']),
      emoji: '💛',
    }
  }

  // Semana Santa (week before Easter Sunday)
  const easter = easterSunday(year)
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day))
  const palmSunday = new Date(easterDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  const semanaStart = palmSunday
  const semanaEnd   = easterDate
  if (now >= semanaStart && now <= semanaEnd) {
    return {
      headline: fill(pick(['Feliz Semana Santa, {name}', 'Buena Semana Santa, {name}']), firstName),
      subline:  pick(['Espero que pases unos días tranquilos.', 'Que sea una semana de descanso.']),
      emoji: '🌿',
    }
  }

  // Día del Trabajo (May 1) — celebrated across Spain and Latin America
  if (month === 5 && day === 1) {
    return {
      headline: fill('Feliz Día del Trabajo, {name}', firstName),
      subline:  pick(['Un día para descansar y reconocer el trabajo de todos.', 'Que disfrutes el feriado.']),
      emoji: '🛠️',
    }
  }

  // Día de la Madre (Mexico: May 10 always; many other countries: 2nd Sunday May — we'll cover both)
  if (month === 5 && day === 10) {
    return {
      headline: fill(pick(['Feliz Día de la Madre, {name}', 'Feliz Día de las Madres, {name}']), firstName),
      subline:  pick(['Un día especial para las mamás. Si eres mamá, ¡felicidades!', 'Para todas las madres de hoy.']),
      emoji: '💐',
    }
  }

  // Día de los Muertos (Nov 1-2) — especially important in Mexico
  if (month === 11 && (day === 1 || day === 2)) {
    return {
      headline: fill(pick(['Feliz Día de los Muertos, {name}', 'Día de los Muertos, {name}']), firstName),
      subline:  pick([
        'Un día para recordar a los que ya no están con nosotros.',
        'Honrando a los que llevamos en el corazón.',
      ]),
      emoji: '🌼',
    }
  }

  // Navidad (Dec 20-26)
  if (month === 12 && day >= 20 && day <= 26) {
    return {
      headline: fill(pick(['¡Feliz Navidad, {name}!', 'Felices fiestas, {name}']), firstName),
      subline:  pick(['Espero que estés con tu familia.', 'Que pases unos días llenos de paz.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        '¡Bienvenido a SignalBoost, {name}!',
        'Qué bueno tenerte aquí, {name}',
        'Hola, {name}, bienvenido',
      ]), firstName),
      subline:  pick([
        'Cuéntame de tu negocio y te ayudo a empezar.',
        'Empezamos de cero. ¿Qué quieres crear?',
        'Pregúntame lo que sea, o crea tu primer proyecto.',
      ]),
      emoji: '🎉',
    }
  }

  // DAY OF WEEK
  if (dow === 6 || dow === 0) {
    return {
      headline: fill(pick(['Buen fin de semana, {name}', 'Trabajando el fin de semana, {name}?', 'Hola de nuevo, {name}']), firstName),
      subline:  pick(['Sin prisa, sin presión.', 'Qué bueno verte por aquí.']),
      emoji: '👋',
    }
  }
  if (dow === 1) {
    return {
      headline: fill(pick(['Feliz lunes, {name}', 'Buen comienzo de semana, {name}', 'Hola de nuevo, {name}']), firstName),
      subline:  pick(['Una nueva semana, nuevas posibilidades.', '¿Por dónde quieres empezar?']),
      emoji: '☕',
    }
  }
  if (dow === 5) {
    return {
      headline: fill(pick(['Feliz viernes, {name}', 'Por fin viernes, {name}', 'Hola de nuevo, {name}']), firstName),
      subline:  pick(['Ya casi es fin de semana.', '¿Qué quieres terminar antes del finde?']),
      emoji: '🌅',
    }
  }

  // DEFAULT (Tue/Wed/Thu)
  return {
    headline: fill(pick(['Bienvenido de vuelta, {name}', 'Qué bueno verte, {name}', 'Hola, {name}']), firstName),
    subline:  pick([
      'Pregúntame lo que sea o continúa donde lo dejaste.',
      '¿En qué trabajamos hoy?',
      'Listo cuando tú lo estés.',
    ]),
    emoji: '👋',
  }
}
