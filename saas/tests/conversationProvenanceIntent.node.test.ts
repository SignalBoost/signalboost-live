// saas/tests/conversationProvenanceIntent.node.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isConversationProvenanceQuestion } from '../lib/ai/cos/conversationProvenanceIntent';

test('pins the exact production miss: "idea" carried no provenance token', () => {
  // This question was served the fresh-evidence restriction message in production,
  // which claimed live evidence had been retrieved for a comedy script COS wrote itself.
  assert.equal(isConversationProvenanceQuestion('where did you get the idea from?'), true);
});

test('the sibling phrasing that already worked keeps working', () => {
  assert.equal(isConversationProvenanceQuestion('where did you get the answer from?'), true);
});

test('origin questions that never name the artifact at all', () => {
  for (const prompt of [
    'where did this come from?',
    "where's that from",
    'What is it based on?',
    'How did you come up with that?',
    'did you make it up?',
    'what was your source',
    'Who told you that?',
  ]) {
    assert.equal(isConversationProvenanceQuestion(prompt), true, prompt);
  }
});

test('all five supported languages', () => {
  for (const prompt of [
    'de dónde sacaste esa idea?',
    'en qué te basaste para el guion?',
    'de onde você tirou essa ideia?',
    'no que se baseou?',
    'skąd to masz?',
    'na czym się opierasz?',
    'откуда ты это взял?',
    'на чём основано?',
  ]) {
    assert.equal(isConversationProvenanceQuestion(prompt), true, prompt);
  }
});

test('accented and Cyrillic prompts survive the boundary guards', () => {
  // An ASCII \b boundary silently fails on these; the Unicode lookarounds must not.
  assert.equal(isConversationProvenanceQuestion('¿De dónde salió esto?'), true);
  assert.equal(isConversationProvenanceQuestion('Откуда вы это взяли?'), true);
});

test('authoring requests that merely mention origins are NOT provenance questions', () => {
  for (const prompt of [
    'write a blog post about where coffee comes from',
    'escribe un artículo sobre de dónde viene el café',
    'напиши текст о том, откуда взялось это слово',
  ]) {
    assert.equal(isConversationProvenanceQuestion(prompt), false, prompt);
  }
});

test('genuine current-fact questions still route to live verification', () => {
  for (const prompt of [
    'where can I get a good espresso machine?',
    'who is the CEO of Nike?',
    'what is SignalBoost and who owns it?',
  ]) {
    assert.equal(isConversationProvenanceQuestion(prompt), false, prompt);
  }
});

test('pasted material is not treated as a question about the turn', () => {
  const pasted = `${'lorem ipsum dolor sit amet '.repeat(30)} where did you get the idea from?`;
  assert.ok(pasted.length > 600);
  assert.equal(isConversationProvenanceQuestion(pasted), false);
});

test('empty and non-string inputs are safe', () => {
  assert.equal(isConversationProvenanceQuestion(''), false);
  assert.equal(isConversationProvenanceQuestion('   '), false);
  assert.equal(isConversationProvenanceQuestion(undefined as unknown as string), false);
});
