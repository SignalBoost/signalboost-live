
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import en from '../locales/en.json' with { type: 'json' }
import es from '../locales/es.json' with { type: 'json' }
import pt from '../locales/pt.json' with { type: 'json' }
import pl from '../locales/pl.json' with { type: 'json' }
import ru from '../locales/ru.json' with { type: 'json' }

const intentRouter = readFileSync(new URL('../lib/orchestration/intent-router.ts', import.meta.url), 'utf8')
const modeSelector = readFileSync(new URL('../lib/orchestration/mode-selector.ts', import.meta.url), 'utf8')
const workflowEngine = readFileSync(new URL('../lib/orchestration/workflow-engine.ts', import.meta.url), 'utf8')

test('orchestration source covers every requested module', () => {
  for (const module of ['promote_business', 'build_website', 'collect_reviews', 'generate_audio', 'create_videos', 'improve_website', 'optimize_podcast_studio', 'lab', 'workshop_apprentice']) {
    assert.match(intentRouter, new RegExp(module))
    assert.match(modeSelector, new RegExp(module))
  }
})

test('orchestration source covers every requested AI mode and fallback workflow behavior', () => {
  for (const mode of ['copywriting', 'seo', 'audio_enhancement', 'video_clipping', 'website_audit', 'podcast_optimization', 'outreach_generation', 'review_collection', 'translation_i18n']) {
    assert.match(modeSelector, new RegExp(mode))
  }
  assert.match(workflowEngine, /maxRetries: 2/)
  assert.match(workflowEngine, /fallback/)
  assert.match(workflowEngine, /operatorRequired/)
})

test('orchestration locale keys exist for all supported languages', () => {
  const locales = [en, es, pt, pl, ru]
  for (const locale of locales) {
    assert.ok(locale.orchestration.title)
    assert.ok(locale.dashboard_modules.improve.title)
    assert.ok(locale.dashboard_modules.podcastStudio.title)
    assert.ok(locale.services.improveWebsite.title)
    assert.ok(locale.services.podcastStudio.title)
  }
})
