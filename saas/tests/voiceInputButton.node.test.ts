import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const buttonSource = readFileSync(new URL('../components/VoiceInputButton.tsx', import.meta.url), 'utf8')
const conciergeSource = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
const assistantSource = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
const homepageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')

test('voice input supports standard and Chromium speech-recognition APIs', () => {
  assert.match(buttonSource, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/)
  assert.match(buttonSource, /interimResults = true/)
  assert.match(buttonSource, /aria-pressed=\{listening\}/)
})

test('voice input is available in both Concierge composers', () => {
  assert.match(conciergeSource, /<VoiceInputButton[\s\S]*?value=\{input\}[\s\S]*?onChange=\{setInput\}/)
  assert.match(assistantSource, /<VoiceInputButton[\s\S]*?value=\{input\}[\s\S]*?onChange=\{setInput\}/)
  assert.match(homepageSource, /<VoiceInputButton[\s\S]*?value=\{question\}[\s\S]*?onChange=\{setQuestion\}/)
})
