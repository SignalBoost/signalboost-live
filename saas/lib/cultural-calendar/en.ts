// saas/lib/cultural-calendar/en.ts
// English greetings + US federal holidays + day-of-week flavor.

import { GreetingContext, Greeting, pick, fill, inRange, nthWeekdayOfMonth, lastWeekdayOfMonth, timeOfDay } from './helpers'

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

  // TIME OF DAY (default greeting for returning users)
  // The hour comes from the user's browser, so it reflects their local time.
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? ' Hope your weekend is going well.' : ''
  const mondayFlavor  = (dow === 1) ? ' A new week ahead.' : ''
  const fridayFlavor  = (dow === 5) ? ' Almost the weekend.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['Good morning, {name}', 'Morning, {name}', 'Good morning, {name}']), firstName),
      subline:  pick(['Ready to make today count?', 'What are we working on this morning?', 'Hope you slept well.']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['Good afternoon, {name}', 'Afternoon, {name}', 'Welcome back, {name}']), firstName),
      subline:  pick(['What are we working on?', 'Hope your day is going well.', 'Ready when you are.']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['Good evening, {name}', 'Evening, {name}', 'Welcome back, {name}']), firstName),
      subline:  pick(['Winding down the day, or just getting started?', 'What can I help with tonight?', 'Glad you stopped by.']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // night (22-04)
  return {
    headline: fill(pick(['Working late, {name}?', 'Still up, {name}', 'Hello, {name}']), firstName),
    subline:  pick(['No judgment. What are we building?', 'Late nights are when the best ideas happen.', 'I am here whenever you are.']),
    emoji: '🌙',
  }
}
