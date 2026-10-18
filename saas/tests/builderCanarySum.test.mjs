import test from 'node:test';
import assert from 'node:assert/strict';
import { sum } from '../lib/builder-canary-sum.mjs';
test('canary adds both values', () => { assert.equal(sum(2, 3), 5); assert.equal(sum(0, 4), 4); assert.equal(sum(-2, 3), 1); });
