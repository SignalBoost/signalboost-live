import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const doc = fs.readFileSync(path.join(ROOT, 'docs/university-teacher-adapter-env.md'), 'utf8')

test('enterprise teacher contract covers public and private provider classes', () => {
  for (const marker of [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'XAI_API_KEY',
    'COS_UNIVERSITY_TEACHER_QWEN_ENABLED',
    'COS_UNIVERSITY_TEACHER_DEEPSEEK_ENABLED',
    'COS_UNIVERSITY_TEACHER_CUSTOM_ENDPOINT',
    'on-prem vLLM',
    'never silently switches providers',
  ]) assert.match(doc, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
