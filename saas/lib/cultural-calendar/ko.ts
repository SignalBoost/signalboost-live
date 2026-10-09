// saas/lib/cultural-calendar/ko.ts
// Korean greetings + Korean fixed-date holidays + day-of-week.
// Polite 합니다/하세요 register. Lunar holidays (Seollal, Chuseok, Buddha's Birthday) are
// omitted because their solar dates need a lunar-calendar table.
// Names are rendered as "{이름}님" so a missing name leaves a clean sentence.

import { GreetingContext, Greeting, pick, fill, inRange, timeOfDay } from './helpers.ts'

export function koreanGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { isNewUser, isLoggedIn } = ctx
  const name = ctx.firstName ? `${ctx.firstName}님` : null
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['SignalBoost에 오신 것을 환영합니다', '안녕하세요', '반갑습니다']),
      subline:  pick([
        '로그인하여 하던 작업을 이어 가거나 새로운 일을 시작하세요.',
        '로그인하여 프로젝트를 확인하세요.',
        '로그인하고 계속 만들어 보세요.',
      ]),
      emoji: '👋',
    }
  }

  // 공휴일 및 기념일

  // 새해 (Dec 30 - Jan 2)
  if (inRange(month, day, 12, 30, 1, 2)) {
    return {
      headline: fill(pick([
        '새해 복 많이 받으세요, {name}',
        '즐거운 새해 되세요, {name}',
        '새로운 한 해를 응원합니다, {name}',
      ]), name),
      subline:  pick(['올해도 멋진 프로젝트가 가득하길 바랍니다.', '새로운 시작입니다. 무엇을 만들어 볼까요?']),
      emoji: '✨',
    }
  }

  // 밸런타인데이 (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill('행복한 밸런타인데이 보내세요, {name}', name),
      subline:  pick(['소중한 사람에게 마음을 전하는 날입니다.', '따뜻한 하루 보내세요.']),
      emoji: '🍫',
    }
  }

  // 삼일절 (Mar 1)
  if (month === 3 && day === 1) {
    return {
      headline: fill('오늘은 삼일절입니다, {name}', name),
      subline:  pick(['독립을 위해 헌신한 분들을 기리는 날입니다.', '뜻깊은 하루 보내세요.']),
      emoji: '🇰🇷',
    }
  }

  // 화이트데이 (Mar 14)
  if (month === 3 && day === 14) {
    return {
      headline: fill('행복한 화이트데이 보내세요, {name}', name),
      subline:  pick(['고마운 마음을 전하는 날입니다.', '달콤한 하루 되세요.']),
      emoji: '🍬',
    }
  }

  // 근로자의 날 (May 1)
  if (month === 5 && day === 1) {
    return {
      headline: fill('근로자의 날입니다, {name}', name),
      subline:  pick(['늘 수고 많으십니다.', '오늘은 푹 쉬시길 바랍니다.']),
      emoji: '🛠️',
    }
  }

  // 어린이날 (May 5)
  if (month === 5 && day === 5) {
    return {
      headline: fill('즐거운 어린이날 보내세요, {name}', name),
      subline:  pick(['아이들의 웃음이 가득한 하루가 되길 바랍니다.', '행복한 휴일 보내세요.']),
      emoji: '🎈',
    }
  }

  // 어버이날 (May 8)
  if (month === 5 && day === 8) {
    return {
      headline: fill('어버이날입니다, {name}', name),
      subline:  pick(['부모님께 감사의 마음을 전해 보세요.', '모든 부모님께 감사드립니다.']),
      emoji: '💐',
    }
  }

  // 스승의 날 (May 15)
  if (month === 5 && day === 15) {
    return {
      headline: fill('스승의 날입니다, {name}', name),
      subline:  pick(['고마운 선생님을 떠올려 보는 날입니다.', '배움을 나눠 준 모든 분께 감사드립니다.']),
      emoji: '📚',
    }
  }

  // 현충일 (Jun 6)
  if (month === 6 && day === 6) {
    return {
      headline: fill('오늘은 현충일입니다, {name}', name),
      subline:  pick(['나라를 위해 희생한 분들을 추모하는 날입니다.', '경건한 하루 보내세요.']),
      emoji: '🕊️',
    }
  }

  // 광복절 (Aug 15)
  if (month === 8 && day === 15) {
    return {
      headline: fill('광복절입니다, {name}', name),
      subline:  pick(['광복의 기쁨을 함께 기억하는 날입니다.', '뜻깊은 휴일 보내세요.']),
      emoji: '🇰🇷',
    }
  }

  // 개천절 (Oct 3)
  if (month === 10 && day === 3) {
    return {
      headline: fill('개천절입니다, {name}', name),
      subline:  pick(['하늘이 열린 날을 기념합니다.', '편안한 휴일 보내세요.']),
      emoji: '🌄',
    }
  }

  // 한글날 (Oct 9)
  if (month === 10 && day === 9) {
    return {
      headline: fill('한글날입니다, {name}', name),
      subline:  pick(['우리 글 한글의 창제를 기념하는 날입니다.', '아름다운 한글처럼 멋진 하루 되세요.']),
      emoji: '📝',
    }
  }

  // 빼빼로데이 (Nov 11)
  if (month === 11 && day === 11) {
    return {
      headline: fill('즐거운 빼빼로데이 보내세요, {name}', name),
      subline:  pick(['소중한 사람과 달콤함을 나눠 보세요.', '오늘은 빼빼로 하나 어떠세요?']),
      emoji: '🍫',
    }
  }

  // 크리스마스 (Dec 24-25)
  if (month === 12 && (day === 24 || day === 25)) {
    return {
      headline: fill(pick(['메리 크리스마스, {name}', '즐거운 성탄절 보내세요, {name}']), name),
      subline:  pick(['소중한 사람들과 따뜻한 시간 보내세요.', '행복한 연말 되시길 바랍니다.']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'SignalBoost에 오신 것을 환영합니다, {name}',
        '함께하게 되어 기쁩니다, {name}',
        '반갑습니다, {name}',
      ]), name),
      subline:  pick([
        '비즈니스에 대해 알려 주시면 시작을 도와드리겠습니다.',
        '처음부터 시작해 봅시다. 무엇을 만들고 싶으신가요?',
        '무엇이든 물어보시거나 첫 프로젝트를 만들어 보세요.',
      ]),
      emoji: '🎉',
    }
  }

  // 시간대 — 사용자의 현지 시간에 따른 기본 인사
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? ' 즐거운 주말 보내세요.' : ''
  const mondayFlavor  = (dow === 1) ? ' 새로운 한 주가 시작됩니다.' : ''
  const fridayFlavor  = (dow === 5) ? ' 곧 주말이에요.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['좋은 아침입니다, {name}', '안녕하세요, {name}', '좋은 아침이에요, {name}']), name),
      subline:  pick(['하루를 시작할 준비가 되셨나요?', '오늘 아침에는 무엇을 해 볼까요?', '푹 쉬셨기를 바랍니다.']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['안녕하세요, {name}', '좋은 오후입니다, {name}', '다시 오신 것을 환영합니다, {name}']), name),
      subline:  pick(['오늘은 무엇을 작업할까요?', '오늘 하루도 순조롭기를 바랍니다.', '준비되시면 언제든 시작하세요.']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['좋은 저녁입니다, {name}', '오늘도 수고 많으셨습니다, {name}', '다시 오신 것을 환영합니다, {name}']), name),
      subline:  pick(['하루를 마무리하시나요, 아니면 이제 시작하시나요?', '오늘 저녁에는 무엇을 도와드릴까요?', '들러 주셔서 반갑습니다.']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // 늦은 밤 (22-04)
  return {
    headline: fill(pick(['늦게까지 일하시네요, {name}', '아직 깨어 계시네요, {name}', '안녕하세요, {name}']), name),
    subline:  pick(['무엇을 만들어 볼까요?', '좋은 아이디어는 밤에 떠오르곤 하죠.', '필요하실 때 언제든 여기 있습니다.']),
    emoji: '🌙',
  }
}
