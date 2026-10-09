// saas/lib/cultural-calendar/ja.ts
// Japanese greetings + Japanese holidays (fixed-date and Happy Monday rules) + day-of-week.
// Polite です/ます register. Equinox days are omitted (they are set by astronomical observation).
// Names are rendered as "、{名前}さん" so a missing name leaves a clean sentence.

import { GreetingContext, Greeting, pick, fill, inRange, nthWeekdayOfMonth, timeOfDay } from './helpers.ts'

export function japaneseGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { isNewUser, isLoggedIn } = ctx
  const name = ctx.firstName ? `、${ctx.firstName}さん` : null
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['SignalBoostへようこそ', 'こんにちは', 'ようこそ']),
      subline:  pick([
        'ログインして前回の続きから始めるか、新しいことを始めましょう。',
        'ログインしてプロジェクトをご覧ください。',
        'ログインして作業を続けましょう。',
      ]),
      emoji: '👋',
    }
  }

  // 祝日・行事

  // 大晦日 (Dec 31)
  if (month === 12 && day === 31) {
    return {
      headline: fill('良いお年をお迎えください{name}', name),
      subline:  pick(['今年も一年お疲れさまでした。', '来年も素晴らしいプロジェクトを一緒に作りましょう。']),
      emoji: '🎍',
    }
  }

  // お正月 (Jan 1-3)
  if (inRange(month, day, 1, 1, 1, 3)) {
    return {
      headline: fill(pick([
        'あけましておめでとうございます{name}',
        '新年おめでとうございます{name}',
      ]), name),
      subline:  pick(['今年も素晴らしいプロジェクトが生まれますように。', '新しい一年の始まりです。何を作りましょうか？']),
      emoji: '🎍',
    }
  }

  // 成人の日 (2nd Monday of January)
  if (month === 1 && day === nthWeekdayOfMonth(year, 1, 1, 2)) {
    return {
      headline: fill('成人の日です{name}', name),
      subline:  pick(['新成人の皆さん、おめでとうございます。', '良い祝日をお過ごしください。']),
      emoji: '👘',
    }
  }

  // 建国記念の日 (Feb 11)
  if (month === 2 && day === 11) {
    return {
      headline: fill('建国記念の日です{name}', name),
      subline:  pick(['良い祝日をお過ごしください。', 'ゆっくり休める一日になりますように。']),
      emoji: '🇯🇵',
    }
  }

  // バレンタインデー (Feb 14)
  if (month === 2 && day === 14) {
    return {
      headline: fill('ハッピーバレンタイン{name}', name),
      subline:  pick(['大切な人に感謝を伝える日です。', 'チョコレートは用意しましたか？']),
      emoji: '🍫',
    }
  }

  // ひな祭り (Mar 3)
  if (month === 3 && day === 3) {
    return {
      headline: fill('ひな祭りです{name}', name),
      subline:  pick(['桃の節句、春の訪れを感じる日です。', '素敵な一日をお過ごしください。']),
      emoji: '🎎',
    }
  }

  // ホワイトデー (Mar 14)
  if (month === 3 && day === 14) {
    return {
      headline: fill('ホワイトデーです{name}', name),
      subline:  pick(['お返しの準備はできましたか？', '感謝を伝える一日に。']),
      emoji: '🤍',
    }
  }

  // こどもの日 (May 5)
  if (month === 5 && day === 5) {
    return {
      headline: fill('こどもの日です{name}', name),
      subline:  pick(['こいのぼりが空を泳ぐ季節です。', '良い祝日をお過ごしください。']),
      emoji: '🎏',
    }
  }

  // ゴールデンウィーク (Apr 29 - May 6)
  if (inRange(month, day, 4, 29, 5, 6)) {
    return {
      headline: fill('ゴールデンウィークですね{name}', name),
      subline:  pick(['連休をゆっくりお楽しみください。', '休みの合間に何か作りましょうか？']),
      emoji: '🌸',
    }
  }

  // 七夕 (Jul 7)
  if (month === 7 && day === 7) {
    return {
      headline: fill('七夕です{name}', name),
      subline:  pick(['短冊にどんな願いを書きますか？', '願いが叶いますように。']),
      emoji: '🎋',
    }
  }

  // 海の日 (3rd Monday of July)
  if (month === 7 && day === nthWeekdayOfMonth(year, 7, 1, 3)) {
    return {
      headline: fill('海の日です{name}', name),
      subline:  pick(['夏本番ですね。良い祝日を。', '海の恵みに感謝する日です。']),
      emoji: '🌊',
    }
  }

  // お盆 (Aug 13-16)
  if (month === 8 && day >= 13 && day <= 16) {
    return {
      headline: fill('お盆ですね{name}', name),
      subline:  pick(['ご家族と穏やかな時間をお過ごしください。', 'ゆっくり休める数日になりますように。']),
      emoji: '🏮',
    }
  }

  // 敬老の日 (3rd Monday of September)
  if (month === 9 && day === nthWeekdayOfMonth(year, 9, 1, 3)) {
    return {
      headline: fill('敬老の日です{name}', name),
      subline:  pick(['長年社会に尽くしてきた方々に感謝する日です。', '良い祝日をお過ごしください。']),
      emoji: '🍵',
    }
  }

  // スポーツの日 (2nd Monday of October)
  if (month === 10 && day === nthWeekdayOfMonth(year, 10, 1, 2)) {
    return {
      headline: fill('スポーツの日です{name}', name),
      subline:  pick(['体を動かすのにぴったりの季節です。', '良い祝日をお過ごしください。']),
      emoji: '🏃',
    }
  }

  // 文化の日 (Nov 3)
  if (month === 11 && day === 3) {
    return {
      headline: fill('文化の日です{name}', name),
      subline:  pick(['文化と芸術に親しむ一日に。', '良い祝日をお過ごしください。']),
      emoji: '🎨',
    }
  }

  // 七五三 (Nov 15)
  if (month === 11 && day === 15) {
    return {
      headline: fill('七五三の日です{name}', name),
      subline:  pick(['子どもたちの健やかな成長を願う日です。', '千歳飴の季節ですね。']),
      emoji: '👘',
    }
  }

  // 勤労感謝の日 (Nov 23)
  if (month === 11 && day === 23) {
    return {
      headline: fill('勤労感謝の日です{name}', name),
      subline:  pick(['いつもお疲れさまです。', '働くすべての人に感謝する日です。']),
      emoji: '🙏',
    }
  }

  // クリスマス (Dec 24-25)
  if (month === 12 && (day === 24 || day === 25)) {
    return {
      headline: fill('メリークリスマス{name}', name),
      subline:  pick(['素敵なクリスマスをお過ごしください。', '大切な人と温かい時間を。']),
      emoji: '🎄',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'SignalBoostへようこそ{name}',
        'ご利用ありがとうございます{name}',
        'はじめまして{name}',
      ]), name),
      subline:  pick([
        'あなたのビジネスについて教えてください。始め方をご案内します。',
        'ゼロから始めましょう。何を作りたいですか？',
        '何でも質問するか、最初のプロジェクトを作成してください。',
      ]),
      emoji: '🎉',
    }
  }

  // 時間帯 — ユーザーの現地時刻に応じた標準の挨拶
  const tod = timeOfDay(now)
  const weekendFlavor = (dow === 0 || dow === 6) ? '良い週末をお過ごしください。' : ''
  const mondayFlavor  = (dow === 1) ? '新しい一週間の始まりです。' : ''
  const fridayFlavor  = (dow === 5) ? 'もうすぐ週末ですね。' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['おはようございます{name}', 'おはようございます{name}', '良い朝ですね{name}']), name),
      subline:  pick(['今日も一日始めましょうか？', '今朝は何に取り組みましょうか？', 'よく休めましたか？']) + mondayFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['こんにちは{name}', 'おかえりなさい{name}', 'こんにちは{name}']), name),
      subline:  pick(['今日は何に取り組みましょうか？', '順調な一日をお過ごしでしょうか。', '準備ができたらいつでもどうぞ。']) + fridayFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['こんばんは{name}', 'お疲れさまです{name}', 'おかえりなさい{name}']), name),
      subline:  pick(['一日の締めくくりですか、それともこれからですか？', '今夜は何をお手伝いしましょうか？', 'お立ち寄りいただきありがとうございます。']) + fridayFlavor,
      emoji: '🌆',
    }
  }
  // 深夜 (22-04)
  return {
    headline: fill(pick(['遅くまでお疲れさまです{name}', 'まだ起きていらっしゃるんですね{name}', 'こんばんは{name}']), name),
    subline:  pick(['何を作りましょうか？', '良いアイデアは夜に生まれるものです。', '必要なときはいつでもどうぞ。']),
    emoji: '🌙',
  }
}
