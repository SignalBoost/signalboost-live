import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SELF_HEALING_CATALOG,
  assertIssuableFeatures,
  catalogFor,
  editionNames,
  featuresForEdition,
  knownFeatureIds,
  unknownFeatures,
} from '../portable-license/catalog.ts';

const PRODUCT = 'self-healing-supervisor';

test('every edition resolves and includes the always-included set', () => {
  const editions = editionNames(PRODUCT);
  assert.ok(editions.length > 0);
  for (const edition of editions) {
    const features = featuresForEdition(PRODUCT, edition);
    assert.ok(features, `edition ${edition} did not resolve`);
    for (const always of SELF_HEALING_CATALOG.alwaysIncluded) {
      assert.ok(features.includes(always), `${edition} is missing always-included ${always}`);
    }
  }
});

test('observation and the approval gate are in every edition, including the cheapest', () => {
  for (const edition of editionNames(PRODUCT)) {
    const features = featuresForEdition(PRODUCT, edition) ?? [];
    assert.ok(features.includes('incident.observe'), `${edition} gates observation`);
    assert.ok(features.includes('siem.export'), `${edition} gates SIEM export`);
    assert.ok(features.includes('approval.gating'), `${edition} gates the approval gate`);
  }
});

test('every edition names only features the catalogue defines', () => {
  for (const [edition, features] of Object.entries(SELF_HEALING_CATALOG.editions)) {
    assert.deepEqual(unknownFeatures(PRODUCT, features), [], `${edition} names an undefined feature`);
  }
  assert.deepEqual(unknownFeatures(PRODUCT, SELF_HEALING_CATALOG.alwaysIncluded), []);
});

test('feature ids are unique', () => {
  const ids = knownFeatureIds(PRODUCT);
  assert.equal(new Set(ids).size, ids.length);
});

test("a typo'd edition returns null rather than an empty licence", () => {
  assert.equal(featuresForEdition(PRODUCT, 'entrprise'), null);
  assert.equal(featuresForEdition(PRODUCT, ''), null);
});

test('an unknown product has no catalogue and cannot be issued against', () => {
  assert.equal(catalogFor('not-a-product'), null);
  assert.deepEqual(knownFeatureIds('not-a-product'), []);
  assert.throws(() => assertIssuableFeatures('not-a-product', ['repair.dispatch']), /No feature catalogue/);
});

test('issuance refuses a feature no code checks', () => {
  assert.throws(
    () => assertIssuableFeatures(PRODUCT, ['repair.dispatch', 'repair.dispatchh']),
    /Unknown feature\(s\).*repair\.dispatchh/s,
  );
});

test('issuance refuses an empty feature list', () => {
  assert.throws(() => assertIssuableFeatures(PRODUCT, []), /unlocks nothing/);
});

test('a valid set passes', () => {
  assert.doesNotThrow(() => assertIssuableFeatures(PRODUCT, featuresForEdition(PRODUCT, 'enterprise') ?? []));
});

test('enterprise is a superset of standard', () => {
  const standard = featuresForEdition(PRODUCT, 'standard') ?? [];
  const enterprise = featuresForEdition(PRODUCT, 'enterprise') ?? [];
  for (const f of standard) {
    assert.ok(enterprise.includes(f), `enterprise drops ${f}, so upgrading would remove a capability`);
  }
});
