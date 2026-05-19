// saas/lib/cultural-calendar/en.ts
// English greetings + US federal holidays + day-of-week flavor.

import { GreetingContext, Greeting, pick, fill, inRange, nthWeekdayOfMonth, lastWeekdayOfMonth } from './helpers'

export function englishGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Welcome to SignalBoost', 'Hello there', 'Glad you stopped by']),
      subline:  pick([
        'Sign in to pick up where you left off, or start something new.',
        'Sign in to see your projects and dashboard.',
        'Log in to keep building.',
      ]),
      emoji: '👋',
    }
  }

  // US FEDERAL & CULTURAL HOLIDAYS

  // New Year (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        'Happy New Year, {name}!',
        'Here is to a fresh start, {name}!',
        'New year, new chapter, {name}!',
      ]), firstName),
      subline:  pick(['A clean page is always a little exciting.', 'Whatever you build this year, let us make it count.']),
      emoji: '✨',
    }
  }

  // MLK Day (3rd Monday in January)
  const mlk = nthWeekdayOfMonth(year, 1, 1, 3)
  if (month === 1 && day === mlk) {
    return {
      headline: fill('Honoring Dr. King today, {name}', firstName),
      subline:  'Reflecting on his vision of a better world.',
      emoji: '✊',
    }
  }

  // Valentine's Day (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill(pick(['Happy Valentine\'s Day, {name}', 'A little love today, {name}']), firstName),
      subline:  pick(['Hope your day is a sweet one.', 'Glad you are here, whatever your day looks like.']),
      emoji: '💛',
    }
  }

  // Memorial Day (last Monday in May)
  const memorial = lastWeekdayOfMonth(year, 5, 1)
  if (month === 5 && day === memorial) {
    return {
      headline: fill('Remembering today, {name}', firstName),
      subline:  'A quiet day of reflection. Thank you for stopping by.',
      emoji: '🇺🇸',
    }
  }

  // Independence Day (Jul 4)
  if (month === 7 && day === 4) {
    return {
      headline: fill(pick(['Happy 4th of July, {name}!', 'Happy Independence Day, {name}!']), firstName),
      subline:  pick(['Hope your day has some fireworks in it.', 'Enjoy the day off — or get a little work in either way.']),
      emoji: '🎆',
    }
  }

  // Labor Day (1st Monday in September)
  const laborDay = nthWeekdayOfMonth(year, 9, 1, 1)
  if (month === 9 && day === laborDay) {
    return {
      headline: fill('Happy Labor Day, {name}', firstName),
      subline:  pick(['Hope you are taking it easy today.', 'A day to honor work — and maybe rest a little.']),
      emoji: '🛠️',
    }
  }

  // Halloween (Oct 31)
  if (month === 10 && day === 31) {
    return {
      headline: fill(pick(['Happy Halloween, {name}!', 'Spooky season, {name}']), firstName),
      subline:  pick(['Hope your day has more treats than tricks.', 'Boo. Welcome back.']),
      emoji: '🎃',
    }
  }

  // Thanksgiving (4th Thursday in November)
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4)
  if (month === 11 && day === thanksgiving) {
    return {
      headline: fill(pick(['Happy Thanksgiving, {name}!', 'Wishing you a warm Thanksgiving, {name}']), firstName),
      subline:  pick(['Hope you are with people you love today.', 'Grateful you are here.']),
      emoji: '🦃',
    }
  }
  // Day after Thanksgiving — gentle nod
  if (month === 11 && day === thanksgiving + 1) {
    return {
      headline: fill('Hope yesterday was good, {name}', firstName),
      subline:  pick(['Leftovers and a little work — perfect combination.', 'No pressure today.']),
      emoji: '🍂',
    }
  }

  // Christmas week (Dec 20-26)
  if (month === 12 && day >= 20 && day <= 26) {
    return {
      headline: fill(pick([
        'Happy holidays, {name}!',
        'Season\'s greetings, {name}!',
        'Merry Christmas, {name}!',
      ]), firstName),
      subline:  pick(['Hope you are getting some rest. Whenever you are ready, I am here.', 'Take it slow this week.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Welcome to SignalBoost, {name}!',
        'Glad you are here, {name}',
        'Hello, {name} — welcome aboard',
      ]), firstName),
      subline:  pick([
        'Tell me about your business and I will help you start.',
        'Brand new dashboard. Let us build something together.',
        'Fresh start. Ask me anything below, or jump in with a project.',
      ]),
      emoji: '🎉',
    }
  }

  // DAY OF WEEK
  if (dow === 6 || dow === 0) {
    return {
      headline: fill(pick(['Hope your weekend is going well, {name}', 'Working on the weekend, {name}?', 'Welcome back, {name}']), firstName),
      subline:  pick(['Whatever brings you here today, glad you are back.', 'No pressure, no rush.', 'Good to see you.']),
      emoji: '👋',
    }
  }
  if (dow === 1) {
    return {
      headline: fill(pick(['Happy Monday, {name}', 'Welcome back, {name}', 'Fresh week, {name}']), firstName),
      subline:  pick(['A new week of possibilities.', 'Hope your week is off to a good start.', 'Let us make this one count.']),
      emoji: '☕',
    }
  }
  if (dow === 5) {
    return {
      headline: fill(pick(['Happy Friday, {name}', 'Welcome back, {name}', 'Friday is here, {name}']), firstName),
      subline:  pick(['Almost the weekend. What do you want to ship today?', 'Wrap something up before the weekend, or just check in.']),
      emoji: '🌅',
    }
  }

  // DEFAULT RETURNING (Tue/Wed/Thu)
  return {
    headline: fill(pick(['Welcome back, {name}', 'Good to see you, {name}', 'Hey {name}', 'Back at it, {name}']), firstName),
    subline:  pick([
      'Good to see you again. Ask me anything or pick up where you left off.',
      'What are we working on today?',
      'Ready when you are.',
    ]),
    emoji: '👋',
  }
}
