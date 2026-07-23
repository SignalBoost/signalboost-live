# Portable Product Manifests

## Purpose

Portable Product Manifests are frozen, JSON-serializable, provider-neutral metadata records. They make each portable product self-describing for future licensing, packaging, documentation, marketplace, and enterprise-catalog work. They do not create any of those systems, and contain no credentials, provider SDKs, callbacks, runtime hooks, browser APIs, or execution behavior.

## Relationship to the registry

Each entry in `saas/lib/portable-products/product-registry.ts` references exactly one manifest from `saas/lib/portable-products/manifests/`. The registry keeps only homepage presentation metadata such as the localized-card key, glyph, sort order, and optional route. Product descriptions, lifecycle status, category, licensing flag, capabilities, dependencies, exclusions, architecture references, and documentation references live in the manifest rather than being duplicated in the registry.

The homepage still renders through the registry selector. Manifests therefore prepare future consumers without changing the homepage's appearance or localization behavior.

## Future consumers

A future marketplace can consume the product identity, audience, maturity, capabilities, and documentation references. A future licensing service can consume stable IDs and licensing availability. A future packaging system can use dependencies and exclusions to define package boundaries. Documentation systems can use the documentation and architecture references to assemble developer guidance. These are only future integration points; this module implements no marketplace, checkout, activation, download, package generation, installer, API, worker, or admin editing flow.

## Customer names and architecture names

Customer-facing names remain independent from internal architecture names. For example, **Agent Operations Platform** may reference `agent-runtime`, `workflow-coordinator`, and `durable-execution` internally without renaming those architecture concepts. Architecture references help developers locate implementation; they do not change the product name shown to customers.

## Validation

`manifestValidation.ts` verifies frozen manifests, duplicate product IDs, duplicate references/dependencies/exclusions, valid maturity/status/category values, and required names and descriptions. Valid manifests validate silently. Add a manifest first, export it from `manifests/index.ts`, then reference that same object from the registry.