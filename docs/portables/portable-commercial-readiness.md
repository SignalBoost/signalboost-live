# Portable Commercial Readiness

The portable architecture closure report proves that each registered product has an explicit core and host boundary. It does **not** prove that a product can be sold, delivered, installed, licensed, upgraded, recovered, or supported.

`saas/lib/portable-products/commercial-readiness.ts` adds a separate fail-closed report for those commercial obligations.

## Required dimensions

A product is commercially ready only when all ten dimensions have explicit evidence:

1. architecture;
2. versioned distribution package;
3. integrity and dependency manifest;
4. buyer installation instructions;
5. licensing and entitlement enforcement boundary;
6. fulfillment or delivery handoff;
7. upgrade, rollback, backup, and recovery procedures;
8. buyer-owned provider and credential configuration;
9. clean-environment deployment and end-to-end buyer acceptance;
10. support ownership, limitations, and escalation boundary.

## Baseline interpretation

All eleven registered products currently receive credit only for the architecture dimension. The baseline report is therefore 10% complete and identifies zero commercially ready products.

This is intentionally stricter than manifest fields such as `licensingAvailable: true`. That field is catalog metadata; it does not prove checkout, entitlement creation, activation, renewal, revocation, download delivery, or license enforcement.

Documentation references, public routes, preview status, and internal tests also do not automatically satisfy commercial evidence dimensions. Evidence must be declared deliberately in the shared contract as focused productization PRs land.

## Safety boundary

The report is read-only. It does not enable checkout, billing, entitlement mutation, credential transfer, provider execution, browser execution, publishing, spending, deployment, infrastructure mutation, or production repair.
