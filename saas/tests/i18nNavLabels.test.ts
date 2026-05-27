import en from '@/locales/en.json'
import pt from '@/locales/pt.json'
import es from '@/locales/es.json'
import pl from '@/locales/pl.json'
import ru from '@/locales/ru.json'

describe('SignalBoost i18n navigation labels', () => {
  const labelsByLang = { en, pt, es, pl, ru }
  const requiredNavKeys = ['promoteBusiness', 'buildWebsite', 'collectReviews', 'generateAudio', 'createVideos', 'lab'] as const

  Object.entries(labelsByLang).forEach(([lang, copy]) => {
    test(`Nav labels exist for ${lang}`, () => {
      requiredNavKeys.forEach((key) => {
        const value = key === 'lab' ? (copy as any).lab?.title : (copy as any)[key]
        expect(value).toBeDefined()
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      })
    })
  })
})
