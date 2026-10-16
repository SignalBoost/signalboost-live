import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dashboard = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/concierge-workspace.css', import.meta.url), 'utf8')

test('dashboard mounts saved history left of flexible unrestricted rendering workspace', () => {
  assert.ok(dashboard.indexOf('cos-history-sidebar') < dashboard.indexOf('Unified assistant workspace'))
  assert.match(dashboard, /flexDirection: 'row'/)
  assert.match(dashboard, /flex: 1, minWidth: 0/)
  assert.match(dashboard, /void openHistory\(\)/)
  assert.doesNotMatch(dashboard, /setHistoryOpen\(false\)\s*\n\s*\} catch/)
})
test('homepage reads only authenticated server history and resumes existing conversations', () => {
  assert.match(home, /fetch\('\/api\/assistant\/chats'/)
  assert.match(home, /loadResumableConversation\(id\)/)
  assert.match(home, /pairResumedTurns\(messages\)/)
  assert.match(home, /rememberResumeId\(CONCIERGE_RESUME_KEYS\.homepage, id\)/)
  assert.match(home, /cos-home-history/)
  assert.match(css, /\.concierge-shell (?:> )?\.cos-home-history/)
  // Production 2026-10-16: the open panel covered the start of every transcript line. On wide
  // screens the shell reserves the panel's column while it is open.
  assert.match(css, /\.concierge-shell:has\(> \.cos-home-history\.is-open\) \{ padding-inline-start: 262px !important; \}/)
  assert.match(home, /<nav className=\{'cos-home-history'/)
  // Production 2026-10-16: with a full list, flex rows shrank to fit the column and every title was
  // cut in half. Rows keep their height and the list scrolls instead.
  assert.match(css, /\.concierge-shell \.cos-history-entry \{[^}]*flex: 0 0 auto;/)
  assert.match(css, /\.concierge-shell \.cos-history-items \{[^}]*overflow-y: auto;[^}]*color-scheme: dark;/)
})
test('homepage history lets the user delete one conversation or the whole history', () => {
  const copySource = readFileSync(new URL('../lib/i18n/conciergeTranscriptCopy.ts', import.meta.url), 'utf8')
  assert.match(home, /className="cos-history-delete"[\s\S]*?deleteSavedChats\(chat\.id\)|deleteSavedChats\(chat\.id\)[\s\S]*?className="cos-history-delete"/)
  assert.match(home, /className="cos-history-delete-all" onClick=\{\(\) => void deleteSavedChats\(null\)\}/)
  assert.match(home, /window\.confirm\(id \? copy\.deleteChatConfirm : copy\.deleteAllConfirm\)/)
  assert.match(home, /\/api\/assistant\/chats\?\$\{id \? `id=\$\{encodeURIComponent\(id\)\}` : 'all=true'\}`, \{ method: 'DELETE' \}/)
  assert.match(home, /if \(!response\.ok\) throw new Error\('delete_failed'\)/)
  assert.match(home, /\{copy\.historyUnavailable\}/)
  assert.doesNotMatch(home, />History unavailable</)
  for (const key of ['deleteChat', 'deleteChatConfirm', 'deleteAllChats', 'deleteAllConfirm', 'deleteFailed', 'historyUnavailable']) {
    assert.equal((copySource.match(new RegExp(`\\n    ${key}: `, 'g')) || []).length, 11, key)
  }
})
