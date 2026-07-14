# Zero-Manual-Entry Enterprise UI Standard

Status: Mandatory for enterprise workspaces

Applies to: COSA, Campaign Studio, Launchpad, and any new enterprise workflow that creates campaigns, content, outreach, launches, or business configuration.

## Authoritative source of truth

This document defines the architecture and `saas/config/master_config_schema.json` defines the approved selectable values. Enterprise components must import or consume that schema rather than creating page-specific option arrays.

When this document, a page implementation, or an AI prompt conflicts with the schema-backed doctrine, this document and the master schema win. Changes to goals, audiences, tones, regions, industries, roles, platforms, languages, formats, offer types, or CTA strategies must be made in the master schema and reviewed through the normal pull-request process.

## Principle

Enterprise workflows must minimize typing. Users provide a validated source URL or choose from structured options. The system extracts context, generates choices, and preserves human approval before execution.

This standard does not remove approval gates. It replaces open-ended data entry with guided selection.

## Mandatory rules

1. Do not use `<input type="text">` or `<textarea>` for campaign-generation inputs.
2. The only permitted free-entry campaign field is a validated URL field using `type="url"`, URL normalization, protocol allowlisting, and server-side validation.
3. Categorical values such as industry, audience, role, objective, tone, platform, region, language, offer type, format, and CTA must use searchable single-select or multi-select components backed by `saas/config/master_config_schema.json`.
4. When creative direction is required, the application must generate multiple bounded suggestions and render them as selectable cards. The user selects, refreshes, or requests another generated set; the user is not asked to compose campaign copy manually.
5. A URL-extraction layer must retrieve and normalize metadata from supported sources, including landing pages and GitHub repositories, then pre-populate structured campaign state.
6. Extracted values must be reviewable before generation. Confidence or provenance should be shown when practical.
7. Publishing, spending, outreach, deletion, infrastructure, and other sensitive actions remain behind existing owner/HMI approval gates.
8. New enterprise views must not introduce unrestricted campaign-generation text controls.
9. No page may define a competing local option list for a category already represented in the master schema.
10. Automated draft generation may occur before approval, but no live action may occur before the final HMI approval gate.

## Allowed exceptions

The restriction is scoped to campaign-generation and enterprise configuration workflows. Free text remains permissible where the product function inherently requires authored text, including:

- Authentication and account identity fields.
- Search boxes.
- Support messages and feedback.
- Human review comments or rejection reasons.
- Secret, token, MFA, vault, and infrastructure values.
- Direct editing of already generated output when the interface explicitly enters an edit mode.
- URL fields that pass strict client-side and server-side URL validation.

Exceptions must not be used to bypass the guided campaign architecture.

## Required shared architecture

Implement and reuse the following layers rather than creating page-specific alternatives:

- `master_config_schema.json`: authoritative option catalog for enterprise configuration.
- `schema dictionaries`: typed adapters derived from the master schema.
- `SearchableSelect`: accessible searchable single-select.
- `SearchableMultiSelect`: accessible searchable multi-select with keyboard support.
- `SuggestionCardGrid`: card-based selection for AI-generated bounded options.
- `SourceUrlField`: URL-only input with validation and extraction status.
- `source extraction API`: server-side fetch/parsing with timeout, redirect, content-size, SSRF, and private-network protections.
- `campaign brief builder`: converts extracted metadata plus selected schema values into the existing API payloads.
- `HMI approval card`: summarizes extracted and selected values before any live action.

## Source extraction safety

Server-side extraction must:

- Permit only `http` and `https`.
- Reject localhost, private, link-local, loopback, metadata-service, and internal network targets.
- Re-resolve redirects and enforce the same network rules on every hop.
- Set timeouts and response-size limits.
- Accept only supported content types.
- Sanitize parsed text and never execute remote scripts.
- Avoid returning credentials, environment variables, repository secrets, or private source content to the browser.

## HMI approval doctrine

The automated system may extract, infer, recommend, and generate draft content. Before publishing, sending, spending, launching, deleting, or changing infrastructure, it must present a final review card containing the source, inferred configuration, selected options, generated assets, provenance where available, and the exact live action that will occur.

The primary action must clearly communicate the consequence, such as `Approve and Launch`, `Approve and Publish`, or `Approve and Send`. Existing owner/admin authorization and approval records must remain intact.

## Migration order

1. COSA campaign command: replace the directive textarea with source URL extraction, structured campaign selectors, and generated campaign concept cards.
2. Campaign Studio (`/dashboard/promote` and any BYOK agency campaign entry point): replace business, audience, promotion, pasted-context, and tone free-entry controls with URL extraction, searchable dictionaries, document extraction, and suggestion cards.
3. Launchpad creator/business/podcast/store interfaces: replace open-ended setup fields with source extraction and structured configuration choices.
4. Remaining active campaign, outreach, creative, sales, and orchestration views.
5. Add an automated repository check that flags newly added campaign-generation `<textarea>` elements, non-URL text inputs, and local option arrays that duplicate master-schema categories under enterprise workspace paths.

## Developer stop rule

The platform owner is not expected to resolve implementation ambiguity. When a developer or AI agent is unsure whether a field is a legitimate exception, whether a component is enterprise-ready, or whether a proposed workflow weakens the HMI gate, the developer must stop before final implementation, document the proposed modular solution, and request owner direction.

## Definition of done

A migrated workflow is complete only when:

- The primary campaign can be created without typing campaign prose.
- URL extraction can populate a useful initial brief.
- All categorical choices use searchable predefined options from the master schema.
- Creative direction is selected from generated cards.
- A final HMI summary appears before any live action.
- Existing approval gates and API behavior are preserved.
- Empty, loading, extraction-error, and retry states are present.
- Keyboard navigation and accessible labels are implemented.
- Supported user-facing strings are localized in English, Spanish, Portuguese, Polish, and Russian.
- Typecheck and applicable tests pass.
