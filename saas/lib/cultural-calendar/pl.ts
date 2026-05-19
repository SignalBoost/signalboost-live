// saas/lib/cultural-calendar/pl.ts
// Polish greetings - includes imieniny (name days), holidays, day-of-week flavor.

import { GreetingContext, Greeting, pick, fill, inRange, easterSunday } from './helpers'
import { getNamedaysForDate } from './pl-namedays'

export function polishGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Witaj w SignalBoost', 'Dzień dobry', 'Cześć, miło Cię widzieć']),
      subline:  pick([
        'Zaloguj się, aby kontynuować lub zacząć coś nowego.',
        'Zaloguj się, aby zobaczyć swoje projekty.',
        'Zaloguj się i twórzmy dalej.',
      ]),
      emoji: '👋',
    }
  }

  // HOLIDAYS

  // Nowy Rok (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        'Szczęśliwego Nowego Roku, {name}!',
        'Wszystkiego najlepszego w Nowym Roku, {name}!',
        'Nowy rok, nowy rozdział, {name}',
      ]), firstName),
      subline:  pick(['Oby ten rok przyniósł dobre projekty.', 'Zaczynamy od nowa. Co chcesz zbudować?']),
      emoji: '✨',
    }
  }

  // Trzech Króli (Jan 6)
  if (month === 1 && day === 6) {
    return {
      headline: fill('Wesołego święta Trzech Króli, {name}', firstName),
      subline:  pick(['Dzień Trzech Króli — koniec okresu świątecznego.', 'Miłego dnia wolnego.']),
      emoji: '👑',
    }
  }

  // Walentynki (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill(pick(['Wesołych Walentynek, {name}', 'Miłych Walentynek, {name}']), firstName),
      subline:  pick(['Dzień zakochanych. Spędź go z kimś bliskim.', 'Miłego dnia, czymkolwiek by się nie skończył.']),
      emoji: '💛',
    }
  }

  // Tłusty Czwartek (52 days before Easter Sunday)
  const easter = easterSunday(year)
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day))
  const tlustyCzwartek = new Date(easterDate.getTime() - 52 * 24 * 60 * 60 * 1000)
  if (month === (tlustyCzwartek.getUTCMonth() + 1) && day === tlustyCzwartek.getUTCDate()) {
    return {
      headline: fill('Smacznego Tłustego Czwartku, {name}!', firstName),
      subline:  pick(['Pączki obowiązkowe.', 'Zjedz dziś pączka — to tradycja.', 'Nie żałuj sobie pączków.']),
      emoji: '🍩',
    }
  }

  // Wielki Tydzień + Wielkanoc (Holy Week)
  const palmSunday = new Date(easterDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (now >= palmSunday && now <= easterDate) {
    return {
      headline: fill(pick(['Wesołych Świąt Wielkanocnych, {name}', 'Spokojnej Wielkanocy, {name}']), firstName),
      subline:  pick(['Życzę spokojnych świąt z rodziną.', 'Wesołego Alleluja.']),
      emoji: '🐣',
    }
  }

  // Konstytucji 3 Maja
  if (month === 5 && day === 3) {
    return {
      headline: fill('Święto Konstytucji 3 Maja, {name}', firstName),
      subline:  pick(['Dzień ważny dla Polski.', 'Miłego święta narodowego.']),
      emoji: '🇵🇱',
    }
  }

  // Boże Ciało (60 days after Easter)
  const bozeCialo = new Date(easterDate.getTime() + 60 * 24 * 60 * 60 * 1000)
  if (month === (bozeCialo.getUTCMonth() + 1) && day === bozeCialo.getUTCDate()) {
    return {
      headline: fill('Wesołych Świąt Bożego Ciała, {name}', firstName),
      subline:  'Spokojnego dnia.',
      emoji: '⛪',
    }
  }

  // Dzień Matki (May 26)
  if (month === 5 && day === 26) {
    return {
      headline: fill('Wszystkiego najlepszego z okazji Dnia Matki, {name}', firstName),
      subline:  pick(['Dzień dla wszystkich mam. Jeśli jesteś mamą — gratulacje!', 'Pamiętaj dziś o swojej mamie.']),
      emoji: '💐',
    }
  }

  // Dzień Dziecka (June 1)
  if (month === 6 && day === 1) {
    return {
      headline: fill('Dzień Dziecka, {name}', firstName),
      subline:  pick(['Dziś każdy może poczuć się dzieckiem.', 'Miłego Dnia Dziecka.']),
      emoji: '🎈',
    }
  }

  // Dzień Ojca (June 23)
  if (month === 6 && day === 23) {
    return {
      headline: fill('Wszystkiego najlepszego z okazji Dnia Ojca, {name}', firstName),
      subline:  pick(['Dzień dla wszystkich tatusiów.', 'Pamiętaj dziś o tacie.']),
      emoji: '👨‍👧',
    }
  }

  // Wszystkich Świętych (Nov 1)
  if (month === 11 && day === 1) {
    return {
      headline: fill('Wszystkich Świętych, {name}', firstName),
      subline:  pick(['Dzień zadumy i pamięci.', 'Czas wspomnień o tych, których z nami nie ma.']),
      emoji: '🕯️',
    }
  }

  // Święto Niepodległości (Nov 11)
  if (month === 11 && day === 11) {
    return {
      headline: fill('Święto Niepodległości, {name}', firstName),
      subline:  pick(['Ważny dzień dla każdego Polaka.', '11 listopada — dzień wolności.']),
      emoji: '🇵🇱',
    }
  }

  // Mikołajki (Dec 6)
  if (month === 12 && day === 6) {
    return {
      headline: fill('Mikołajki, {name}!', firstName),
      subline:  pick(['Sprawdź, czy Mikołaj coś dla Ciebie zostawił.', 'Miłego dnia świętego Mikołaja.']),
      emoji: '🎁',
    }
  }

  // Boże Narodzenie (Dec 24-26)
  if (month === 12 && day >= 24 && day <= 26) {
    return {
      headline: fill(pick(['Wesołych Świąt Bożego Narodzenia, {name}!', 'Wesołych Świąt, {name}']), firstName),
      subline:  pick(['Życzę spokojnych i ciepłych świąt z rodziną.', 'Niech te dni będą pełne radości.']),
      emoji: '🎄',
    }
  }

  // IMIENINY (NAME DAYS) - check if today is a name day for any common Polish name
  // We greet the user IF their name matches today's name day, OR we acknowledge all today's celebrants.
  const todaysNames = getNamedaysForDate(month, day)
  if (todaysNames.length > 0) {
    // Does the user's name match? (case-insensitive, accent-tolerant)
    const userName = (firstName || '').toLowerCase()
    const isUserNameday = userName && todaysNames.some(n => n.toLowerCase() === userName)

    if (isUserNameday) {
      // It's THEIR name day — special greeting
      return {
        headline: fill(pick([
          'Wszystkiego najlepszego z okazji imienin, {name}!',
          'Sto lat z okazji imienin, {name}!',
          'Najlepsze życzenia imieninowe, {name}!',
        ]), firstName),
        subline:  pick([
          'Dziś Twoje święto. Spełnienia marzeń!',
          'Zdrowia, szczęścia i wszystkiego najlepszego.',
          'Sto lat, sto lat — niech żyje Tobie.',
        ]),
        emoji: '🎂',
      }
    }

    // Otherwise — mention today's name day celebrants as flavor (mix with normal greeting)
    // Pick this 50% of the time so it's not always the same vibe.
    if (Math.random() < 0.5) {
      const namesText = todaysNames.slice(0, 2).join(' i ')
      return {
        headline: fill(pick(['Witaj ponownie, {name}', 'Cześć, {name}', 'Miło Cię widzieć, {name}']), firstName),
        subline:  `Dziś imieniny obchodzą ${namesText}. Może warto zadzwonić?`,
        emoji: '🎂',
      }
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Witaj w SignalBoost, {name}!',
        'Miło Cię widzieć, {name}',
        'Dzień dobry, {name}',
      ]), firstName),
      subline:  pick([
        'Opowiedz mi o swoim biznesie, a pomogę Ci zacząć.',
        'Zaczynamy od zera. Co chcesz stworzyć?',
        'Zapytaj o cokolwiek lub stwórz swój pierwszy projekt.',
      ]),
      emoji: '🎉',
    }
  }

  // DAY OF WEEK
  if (dow === 6 || dow === 0) {
    return {
      headline: fill(pick(['Miłego weekendu, {name}', 'Pracujesz w weekend, {name}?', 'Witaj ponownie, {name}']), firstName),
      subline:  pick(['Bez pośpiechu.', 'Miło, że jesteś.']),
      emoji: '👋',
    }
  }
  if (dow === 1) {
    return {
      headline: fill(pick(['Miłego poniedziałku, {name}', 'Dobrego tygodnia, {name}', 'Witaj ponownie, {name}']), firstName),
      subline:  pick(['Nowy tydzień, nowe możliwości.', 'Od czego zaczynamy?']),
      emoji: '☕',
    }
  }
  if (dow === 5) {
    return {
      headline: fill(pick(['Wesołego piątku, {name}', 'W końcu piątek, {name}', 'Witaj ponownie, {name}']), firstName),
      subline:  pick(['Już prawie weekend.', 'Co chcesz skończyć przed weekendem?']),
      emoji: '🌅',
    }
  }

  // DEFAULT (Tue/Wed/Thu)
  return {
    headline: fill(pick(['Witaj ponownie, {name}', 'Miło Cię widzieć, {name}', 'Cześć, {name}']), firstName),
    subline:  pick([
      'Zapytaj o cokolwiek lub kontynuuj od miejsca, w którym skończyłeś.',
      'Nad czym dziś pracujemy?',
      'Jestem gotowy, kiedy Ty będziesz.',
    ]),
    emoji: '👋',
  }
}
