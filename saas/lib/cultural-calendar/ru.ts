// saas/lib/cultural-calendar/ru.ts
// Russian greetings - includes именины (name days), Russian holidays, day-of-week.

import { GreetingContext, Greeting, pick, fill, inRange, timeOfDay } from './helpers'
import { getRussianNamedaysForDate } from './ru-namedays'

export function russianGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { firstName, isNewUser, isLoggedIn } = ctx
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['Добро пожаловать в SignalBoost', 'Здравствуйте', 'Рады видеть Вас']),
      subline:  pick([
        'Войдите, чтобы продолжить работу или начать новый проект.',
        'Войдите, чтобы увидеть свои проекты.',
        'Войдите и продолжайте создавать.',
      ]),
      emoji: '👋',
    }
  }

  // HOLIDAYS

  // Новый Год + Рождественские каникулы (Dec 30 - Jan 8 - extended Russian New Year holidays)
  if (inRange(month, day, 12, 30, 1, 8)) {
    return {
      headline: fill(pick([
        'С Новым Годом, {name}!',
        'С наступившим Новым Годом, {name}!',
        'Счастливого Нового Года, {name}!',
      ]), firstName),
      subline:  pick(['Пусть этот год принесёт хорошие проекты.', 'Начинаем заново. Что хотите создать?']),
      emoji: '🎄',
    }
  }

  // Рождество (Jan 7 - Orthodox Christmas)
  if (month === 1 && day === 7) {
    return {
      headline: fill('С Рождеством, {name}!', firstName),
      subline:  pick(['Светлого праздника.', 'Мира, добра и тепла в Ваш дом.']),
      emoji: '⭐',
    }
  }

  // Старый Новый Год (Jan 14)
  if (month === 1 && day === 14) {
    return {
      headline: fill('Со Старым Новым Годом, {name}', firstName),
      subline:  pick(['Старый Новый Год — наша добрая традиция.', 'Ещё один повод порадоваться.']),
      emoji: '✨',
    }
  }

  // День Защитника Отечества (Feb 23)
  if (month === 2 && day === 23) {
    return {
      headline: fill('С Днём Защитника Отечества, {name}!', firstName),
      subline:  pick(['Поздравляем всех мужчин.', 'Мужественности, силы и стойкости.']),
      emoji: '🎖️',
    }
  }

  // Международный Женский День (Mar 8) — culturally huge in Russia
  if (month === 3 && day === 8) {
    return {
      headline: fill('С 8 Марта, {name}!', firstName),
      subline:  pick([
        'Поздравляем всех женщин с праздником весны.',
        'Красоты, нежности и радости в каждом дне.',
        'Сегодня день, когда хочется дарить цветы всем женщинам.',
      ]),
      emoji: '🌷',
    }
  }

  // День Космонавтики (Apr 12)
  if (month === 4 && day === 12) {
    return {
      headline: fill('С Днём Космонавтики, {name}!', firstName),
      subline:  pick(['12 апреля — день, когда человек впервые полетел в космос.', 'Гордимся!']),
      emoji: '🚀',
    }
  }

  // Праздник Весны и Труда (May 1)
  if (month === 5 && day === 1) {
    return {
      headline: fill('С Праздником Весны и Труда, {name}!', firstName),
      subline:  pick(['Мира, труда, мая!', 'С первомаем!']),
      emoji: '🌸',
    }
  }

  // День Победы (May 9)
  if (month === 5 && day === 9) {
    return {
      headline: fill('С Днём Победы, {name}', firstName),
      subline:  pick(['Помним и чтим.', 'Светлая память героям.', '9 мая — священный день.']),
      emoji: '🕊️',
    }
  }

  // День Семьи Любви и Верности (July 8)
  if (month === 7 && day === 8) {
    return {
      headline: fill('С Днём Семьи, Любви и Верности, {name}', firstName),
      subline:  'Тепла Вашему дому.',
      emoji: '🌼',
    }
  }

  // День Знаний (Sept 1)
  if (month === 9 && day === 1) {
    return {
      headline: fill('С Днём Знаний, {name}!', firstName),
      subline:  pick(['1 сентября — пора учиться чему-то новому.', 'Удачного начала учебного года!']),
      emoji: '📚',
    }
  }

  // День Народного Единства (Nov 4)
  if (month === 11 && day === 4) {
    return {
      headline: fill('С Днём Народного Единства, {name}', firstName),
      subline:  'Сильны, когда вместе.',
      emoji: '🇷🇺',
    }
  }

  // ИМЕНИНЫ — check if today is the user's name day
  const todaysNames = getRussianNamedaysForDate(month, day)
  if (todaysNames.length > 0) {
    const userName = (firstName || '').toLowerCase()
    const isUserNameday = userName && todaysNames.some(n => n.toLowerCase() === userName)

    if (isUserNameday) {
      return {
        headline: fill(pick([
          'С Именинами, {name}!',
          'С Днём Ангела, {name}!',
          'С Твоим Днём, {name}!',
        ]), firstName),
        subline:  pick([
          'Здоровья, счастья и всего самого доброго.',
          'Сегодня Ваш день. Пусть он будет светлым.',
          'Долгих лет и доброго здравия.',
        ]),
        emoji: '🎂',
      }
    }

    // Occasionally mention today's name day celebrants
    if (Math.random() < 0.4) {
      const namesText = todaysNames.slice(0, 2).join(' и ')
      return {
        headline: fill(pick(['С возвращением, {name}', 'Здравствуйте, {name}', 'Рады видеть Вас, {name}']), firstName),
        subline:  `Сегодня именины у ${namesText}. Может, стоит поздравить?`,
        emoji: '🎂',
      }
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'Добро пожаловать в SignalBoost, {name}!',
        'Рады, что Вы здесь, {name}',
        'Здравствуйте, {name}',
      ]), firstName),
      subline:  pick([
        'Расскажите мне о Вашем деле, и я помогу начать.',
        'Начинаем с чистого листа. Что хотите создать?',
        'Спросите меня о чём угодно или начните свой первый проект.',
      ]),
      emoji: '🎉',
    }
  }

  // ВРЕМЯ СУТОК — приветствие по местному времени пользователя
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? ' Хороших выходных.' : ''
  const mondayFlavor  = (dow === 1) ? ' Новая неделя началась.' : ''
  const fridayFlavor  = (dow === 5) ? ' Скоро выходные.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['Доброе утро, {name}', 'Доброе утро, {name}', 'С добрым утром, {name}']), firstName),
      subline:  pick(['Готовы начать день?', 'Над чем работаем этим утром?', 'Надеюсь, Вы хорошо отдохнули.']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['Добрый день, {name}', 'Добрый день, {name}', 'С возвращением, {name}']), firstName),
      subline:  pick(['Над чем сегодня работаем?', 'Надеюсь, день идёт хорошо.', 'Готов, когда Вы будете.']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['Добрый вечер, {name}', 'Добрый вечер, {name}', 'С возвращением, {name}']), firstName),
      subline:  pick(['Завершаете день или только начинаете?', 'Чем могу помочь сегодня вечером?', 'Рады, что зашли.']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // ночь (22-04)
  return {
    headline: fill(pick(['Работаете допоздна, {name}?', 'Ещё не спите, {name}', 'Здравствуйте, {name}']), firstName),
    subline:  pick(['Без осуждения. Что строим?', 'Лучшие идеи приходят ночью.', 'Я здесь, когда Вы готовы.']),
    emoji: '🌙',
  }
}
