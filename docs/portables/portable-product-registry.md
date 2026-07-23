# Portable Product Registry

## Purpose

`saas/lib/portable-products/` is the canonical, provider-neutral catalog for portable **products**. It is presentation and catalog infrastructure only: descriptors are immutable serializable data, selectors are pure, and the module has no provider execution, browser execution, public API, checkout, licensing activation, package generation, download, mutation, or worker behavior.

A product is a customer-facing offer with a stable `productId`. An architecture component is an implementation concern. Architecture paths and capability tags help developers find relevant code, but they are never rendered on the public homepage and do not turn a component or compatibility descriptor into a product.

## Stable IDs and lifecycle

IDs are lowercase kebab-case and must not be renamed for marketing copy changes. `status` is `live`, `preview`, `internal`, `deprecated`, or `hidden`; `implementationStatus` separately records `implemented`, `preview`, `internal_component`, `descriptor_only`, or `deprecated`. Public selectors omit internal and hidden entries, and omit deprecated entries unless explicitly requested. Licensable selectors include only catalog entries marked available.

A descriptor-only compatibility target is not a live product. It can describe a possible future host/provider shape but cannot be presented as implemented or executable.

## Homepage and localization

`saas/app/page.tsx` imports only `listPublicPortableProducts()` and renders the existing cards in deterministic sort order. It uses each descriptor's `localizationKey` under `homepage.portables` and falls back to the descriptor's English name and description. The five language dictionaries remain the source for localized display copy.

`Agent Operations Platform` is the customer-facing portable product name. The underlying technical implementation may continue to use agent-runtime terminology.

`Browser Agent Ecosystem` is the customer-facing portable product name. The underlying technical implementation remains split across portable-browser, browser-provider, and related runtime modules.

## Current catalog

| ID | Name | Status | Public | Licensable |
| --- | --- | --- | --- | --- |
| campaign-studio | Campaign Studio | live | yes | yes |
| integrations-hub | Integrations Hub | live | yes | yes |
| video-maker | Video Maker | live | yes | yes |
| control-center | Control Center | live | yes | yes |
| marketing-sales | Marketing + Sales | live | yes | yes |
| press-media | Press & Media | live | yes | yes |
| portable-ai-chief-of-staff | Portable AI Chief of Staff | preview | yes | no |
| browser-agent-ecosystem | Browser Agent Ecosystem | preview / descriptor-only | yes | no |
| agent-operations-platform | Agent Operations Platform | preview | yes | no |
| self-healing-supervisor | Self-Healing Supervisor | preview | yes | no |

## Adding or renaming a portable

1. Add a frozen descriptor in `product-registry.ts` with a unique stable ID and sort order.
2. Use documentation and architecture paths only as metadata; do not import implementation modules.
3. Add all five `homepage.portables.<localizationKey>` translations.
4. Preserve approval and lifecycle truth: do not mark previews or descriptor-only targets live.
5. Run the registry tests and typecheck.

To rename a product safely, retain its `productId`, update `fallbackName` and translations, and update this catalog table. A new ID is only appropriate for a genuinely new customer-facing product. This separation keeps future marketplace/catalog consumers compatible without implying checkout, entitlement, or fulfillment behavior.
