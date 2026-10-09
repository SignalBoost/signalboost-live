// saas/lib/cultural-calendar/ar.ts
// Arabic greetings (Modern Standard Arabic) + fixed-date observances across the Arab world + day-of-week.
// Hijri-calendar holidays (Ramadan, Eid al-Fitr, Eid al-Adha, Islamic New Year, Mawlid) are omitted
// because their Gregorian dates need a lunar-calendar table.
// Names are rendered as "، {name}" so a missing name leaves a clean sentence.
// The working week follows most Arab countries: Sunday starts the week, Friday-Saturday is the weekend.

import { GreetingContext, Greeting, pick, fill, inRange, timeOfDay } from './helpers.ts'

export function arabicGreeting(now: Date, ctx: GreetingContext): Greeting {
  const { isNewUser, isLoggedIn } = ctx
  const name = ctx.firstName ? `، ${ctx.firstName}` : null
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const dow = now.getUTCDay()

  // LOGGED OUT
  if (!isLoggedIn) {
    return {
      headline: pick(['مرحبًا بك في SignalBoost', 'أهلًا وسهلًا', 'مرحبًا بك']),
      subline:  pick([
        'سجّل الدخول لتكمل من حيث توقفت، أو ابدأ شيئًا جديدًا.',
        'سجّل الدخول لعرض مشاريعك.',
        'سجّل الدخول لمواصلة البناء.',
      ]),
      emoji: '👋',
    }
  }

  // المناسبات

  // رأس السنة الميلادية (Dec 31 - Jan 1)
  if (inRange(month, day, 12, 31, 1, 1)) {
    return {
      headline: fill(pick([
        'سنة سعيدة{name}!',
        'كل عام وأنت بخير{name}!',
      ]), name),
      subline:  pick(['نتمنى لك عامًا مليئًا بالمشاريع الناجحة.', 'بداية جديدة. ماذا تريد أن تبني هذا العام؟']),
      emoji: '✨',
    }
  }

  // عيد الأم (Mar 21)
  if (month === 3 && day === 21) {
    return {
      headline: fill('عيد أم سعيد{name}', name),
      subline:  pick(['تحية لكل الأمهات في يومهن.', 'يوم لتكريم الأمهات وشكرهن.']),
      emoji: '💐',
    }
  }

  // عيد العمال (May 1)
  if (month === 5 && day === 1) {
    return {
      headline: fill('عيد عمال سعيد{name}', name),
      subline:  pick(['تحية لكل من يعمل بجد.', 'نتمنى لك يومًا مريحًا.']),
      emoji: '🛠️',
    }
  }

  // اليوم العالمي للغة العربية (Dec 18)
  if (month === 12 && day === 18) {
    return {
      headline: fill('اليوم العالمي للغة العربية{name}', name),
      subline:  pick(['نحتفي اليوم بلغة الضاد وجمالها.', 'لغة يتحدثها مئات الملايين حول العالم.']),
      emoji: '📜',
    }
  }

  // BRAND NEW USER
  if (isNewUser) {
    return {
      headline: fill(pick([
        'مرحبًا بك في SignalBoost{name}!',
        'يسعدنا وجودك معنا{name}',
        'أهلًا وسهلًا{name}',
      ]), name),
      subline:  pick([
        'أخبرني عن عملك وسأساعدك على البدء.',
        'لنبدأ من الصفر. ماذا تريد أن تنشئ؟',
        'اسألني أي شيء، أو أنشئ مشروعك الأول.',
      ]),
      emoji: '🎉',
    }
  }

  // وقت اليوم — التحية الافتراضية حسب التوقيت المحلي للمستخدم
  const tod = timeOfDay(now)
  const weekendFlavor  = (dow === 5 || dow === 6) ? ' نتمنى لك عطلة نهاية أسبوع سعيدة.' : ''
  const weekStartFlavor = (dow === 0) ? ' أسبوع جديد يبدأ.' : ''
  const preWeekendFlavor = (dow === 4) ? ' عطلة نهاية الأسبوع على الأبواب.' : ''

  if (tod === 'morning') {
    return {
      headline: fill(pick(['صباح الخير{name}', 'صباح النور{name}', 'صباح الخير{name}']), name),
      subline:  pick(['هل أنت مستعد لبدء اليوم؟', 'على ماذا نعمل هذا الصباح؟', 'نتمنى أن تكون قد نلت قسطًا جيدًا من الراحة.']) + weekStartFlavor + weekendFlavor,
      emoji: '☀️',
    }
  }
  if (tod === 'afternoon') {
    return {
      headline: fill(pick(['مرحبًا{name}', 'نهارك سعيد{name}', 'مرحبًا بعودتك{name}']), name),
      subline:  pick(['على ماذا نعمل اليوم؟', 'نتمنى أن يكون يومك جيدًا.', 'جاهز متى كنت مستعدًا.']) + preWeekendFlavor + weekendFlavor,
      emoji: '👋',
    }
  }
  if (tod === 'evening') {
    return {
      headline: fill(pick(['مساء الخير{name}', 'مساء النور{name}', 'مرحبًا بعودتك{name}']), name),
      subline:  pick(['هل تختم يومك أم تبدأه للتو؟', 'كيف يمكنني مساعدتك هذا المساء؟', 'سعيد بزيارتك.']) + preWeekendFlavor,
      emoji: '🌆',
    }
  }
  // آخر الليل (22-04)
  return {
    headline: fill(pick(['تعمل حتى وقت متأخر{name}؟', 'ما زلت مستيقظًا{name}؟', 'مرحبًا{name}']), name),
    subline:  pick(['ماذا نبني الآن؟', 'أفضل الأفكار تأتي ليلًا.', 'أنا هنا متى احتجت إليّ.']),
    emoji: '🌙',
  }
}
