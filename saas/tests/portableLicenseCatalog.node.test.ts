import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SELF_HEALING_CATALOG,
  allCatalogs,
  assertIssuableFeatures,
  catalogFor,
  catalogedProductIds,
  editionNames,
  featuresForEdition,
  knownFeatureIds,
  unknownFeatures,
} from '../portable-license/catalog.ts';

const PRODUCT = 'self-healing-supervisor';

// The structural rules hold for EVERY product, not just the one that happened to
// be written first. A new catalogue inherits these instead of being trusted to
// remember them.
test('every catalogue: always-included features appear in every edition', () => {
  for (const catalog of allCatalogs()) {
    const editions = Object.keys(catalog.editions);
    assert.ok(editions.length > 0, `${catalog.productId} defines no editions`);
    for (const edition of editions) {
      const features = featuresForEdition(catalog.productId, edition) ?? [];
      for (const always of catalog.alwaysIncluded) {
        assert.ok(features.includes(always), `${catalog.productId}/${edition} is missing always-included ${always}`);
      }
    }
  }
});

test('every catalogue: editions name only defined features, and ids are unique', () => {
  for (const catalog of allCatalogs()) {
    assert.deepEqual(unknownFeatures(catalog.productId, catalog.alwaysIncluded), [], catalog.productId);
    for (const [edition, features] of Object.entries(catalog.editions)) {
      assert.deepEqual(
        unknownFeatures(catalog.productId, features),
        [],
        `${catalog.productId}/${edition} names an undefined feature`,
      );
    }
    const ids = knownFeatureIds(catalog.productId);
    assert.equal(new Set(ids).size, ids.length, `${catalog.productId} has duplicate feature ids`);
  }
});

test('every catalogue: an observation capability is always included, never sold', () => {
  // Rule 1. A buyer never loses sight of their own system over a billing question.
  for (const catalog of allCatalogs()) {
    const observing = catalog.alwaysIncluded.filter((id) => /observe|audit|export|evidence/.test(id));
    assert.ok(
      observing.length > 0,
      `${catalog.productId} gates every observation capability — reading your own records must not be a paid tier`,
    );
  }
});

test('every catalogue: enterprise is a superset of standard', () => {
  for (const catalog of allCatalogs()) {
    const editions = Object.keys(catalog.editions);
    if (!editions.includes('standard') || !editions.includes('enterprise')) continue;
    const standard = featuresForEdition(catalog.productId, 'standard') ?? [];
    const enterprise = featuresForEdition(catalog.productId, 'enterprise') ?? [];
    for (const f of standard) {
      assert.ok(enterprise.includes(f), `${catalog.productId}: enterprise drops ${f}, so upgrading removes a capability`);
    }
  }
});

test('every catalogue: a valid edition is issuable and a typo is not', () => {
  for (const id of catalogedProductIds()) {
    for (const edition of editionNames(id)) {
      assert.doesNotThrow(() => assertIssuableFeatures(id, featuresForEdition(id, edition) ?? []), `${id}/${edition}`);
    }
    assert.equal(featuresForEdition(id, 'enterprize'), null, `${id} resolved a typo'd edition`);
    assert.throws(() => assertIssuableFeatures(id, ['not.a.real.feature']), /Unknown feature/, id);
  }
});

test('the three shipping portables all have a catalogue', () => {
  const ids = catalogedProductIds();
  for (const expected of ['self-healing-supervisor', 'press-media', 'provider-hub']) {
    assert.ok(ids.includes(expected), `${expected} has no feature catalogue, so no licence can be issued for it`);
  }
});

test('press & media never sells the anti-fabrication kernel as an upgrade', () => {
  // The one that would turn a cheaper edition into a reputational incident.
  const catalog = catalogFor('press-media');
  assert.ok(catalog);
  assert.ok(catalog.alwaysIncluded.includes('press.factual-discipline'));
  assert.ok(catalog.alwaysIncluded.includes('press.owner-approval'));
  for (const edition of editionNames('press-media')) {
    const features = featuresForEdition('press-media', edition) ?? [];
    assert.ok(features.includes('press.factual-discipline'), `${edition} could invent facts`);
    assert.ok(features.includes('press.owner-approval'), `${edition} could dispatch without a human`);
  }
});

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
