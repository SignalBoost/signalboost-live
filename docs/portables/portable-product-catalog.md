# Portable Product Catalog

## Purpose and scope

The Portable Product Catalog is an **internal inspection surface**. It exposes a bounded, read-only view of metadata already defined by the Portable Product Registry and Portable Product Manifests. It does not sell, license, activate, package, download, or execute portable products.

It is intended for developers and internal operators who need to inspect the existing product definitions without duplicating metadata. It is not a public marketplace or storefront.

## Access control

Both catalog surfaces use the existing admin access pattern:

- `GET /api/internal/portable-products` calls `requireAdmin` and returns the existing unauthenticated/unauthorized responses before serializing catalog data.
- `/dashboard/portable-products` uses the dashboard's existing `getCurrentUser` and `getAccess` checks. Unauthenticated users are redirected to login; non-admin users see no catalog data.

## API

`GET /api/internal/portable-products` returns:

```json
{
  "schemaVersion": "portable-product-catalog.v1",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "items": []
}
```

Every item contains only these allowlisted fields: `productId`, `displayName`, `shortDescription`, `longDescription`, `category`, `status`, `maturity`, `publicVisible`, `licensingAvailable`, `supportedLanguages`, `targetAudience`, `requiredCapabilities`, `optionalCapabilities`, `dependencies`, `exclusions`, `architectureReferences`, `documentationReferences`, and `futureFeatures`.

The response is ordered by the registry's stable sort order (then product ID), is JSON-serializable, and returns detached frozen arrays. No raw registry descriptor or manifest object is returned.

### Filters and validation

The only supported optional query parameters are `status`, `category`, `publicVisible`, `licensingAvailable`, and `productId`. Status currently accepts `live` or `preview`; category accepts the registry's declared categories; booleans accept only `true` or `false`; and product IDs must identify an included catalog product.

Unknown parameters, duplicate parameters, invalid enum/boolean values, unknown product IDs, free-text search, arbitrary sorting, field selection, database-style query syntax, and mutation parameters all receive `400 { "error": "Invalid portable product catalog filter" }`.

### Inclusion rule

The catalog starts with the existing Portable Product Registry. It includes registered entries unless their manifest status is `internal`, `hidden`, or `deprecated`. Thus all current public registry products can appear, while a non-registry implementation such as Durable Agent Runtime does not appear. This preserves a bounded operator inspection surface rather than turning arbitrary implementation metadata into a catalog.

## Dashboard page

`/dashboard/portable-products` is a read-only internal page with bounded link filters for status, category, public visibility, and licensing availability. Each product displays its name, stable ID, status, maturity, category, visibility, licensing availability, short description, supported languages, architecture references, documentation references, dependencies, and exclusions. Architecture paths are intentionally limited to this internal page and are not added to the public homepage.

The page has no checkout, purchase, edit, activation, download, package, delete, or mutation controls.

## Relationship to registry, manifests, and future marketplace work

The registry controls which portable products are catalog candidates and their deterministic order. The manifest remains the source for product metadata. The serializer is the only boundary that chooses which manifest fields become inspectable.

A future marketplace, licensing system, checkout flow, package generator, installer, or download service must be built separately behind its own reviewed authorization, approval, payment, and fulfillment boundaries. This catalog deliberately provides none of those capabilities. In particular, licensing activation does not exist here because `licensingAvailable` is metadata only; checkout does not exist because the API/page are inspection-only; and downloads do not exist because no artifacts are created or exposed.

## Safe evolution and versioning

To add an inspectable field, first add and validate it in the manifest contract, then explicitly copy it in `serializePortableProductCatalogItem`, document it here, and add behavioral tests showing it is detached and JSON-safe. Never spread a manifest or registry entry into the response.

If a change breaks response compatibility, introduce a new schema version such as `portable-product-catalog.v2`, retain the prior endpoint contract for its supported lifecycle, and update consumers deliberately. Additive fields may remain in the current version only after the serializer allowlist, tests, and documentation have been updated.

## Current limitations

The catalog has no persistence, no Supabase reads/writes, no environment values, no provider clients, no runtime clients, no filesystem or child-process work, no production worker, no browser/provider execution, and no COS tool registration. It only inspects existing static registry and manifest metadata.
