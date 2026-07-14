# Zero-Manual-Entry Enterprise UI Standard

Status: Mandatory for enterprise workspaces

Applies to: COSA, Campaign Studio, Launchpad, and any new enterprise workflow that creates campaigns, content, outreach, launches, or business configuration.

## Principle

Enterprise workflows must minimize typing. Users provide a validated source URL or choose from structured options. The system extracts context, generates choices, and preserves human approval before execution.

This standard does not remove approval gates. It replaces open-ended data entry with guided selection.

## Mandatory rules

1. Do not use `<input type="text">` or `<textarea>` for campaign-generation inputs.
2. The only permitted free-entry campaign field is a validated URL field using `type="url"`, URL normalization, protocol allowlisting, and server-side validation.
3. Categorical values such as industry, audience, role, objective, tone, platform, region, language, offer type, format, and CTA must use searchable single-select or multi-select components backed by predefined schema dictionaries.
4. When creative direction is required, the application must generate multiple bounded suggestions and render them as selectable cards. The user selects, refreshes, or requests another generated set; the user is not asked to compose campaign copy manually.
5. A URL-extraction layer must retrieve and normalize metadata from supported sources, including landing pages and GitHub repositories, then pre-populate structured campaign state.
6. Extracted values must be reviewable before generation. Confidence or provenance should be shown when practical.
7. Publishing, spending, outreach, deletion, infrastructure, and other sensitive actions remain behind existing owner/HMI approval gates.
8. New enterprise views must not introduce unrestricted campaign-generation text controls.

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

- `schema dictionaries`: typed option catalogs for industries, audiences, roles, objectives, tones, platforms, regions, languages, formats, and CTA strategies.
- `SearchableSelect`: accessible searchable single-select.
- `SearchableMultiSelect`: accessible searchable multi-select with keyboard support.
- `SuggestionCardGrid`: card-based selection for AI-generated bounded options.
- `SourceUrlField`: URL-only input with validation and extraction status.
- `source extraction API`: server-side fetch/parsing with timeout, redirect, content-size, SSRF, and private-network protections.
- `campaign brief builder`: converts extracted metadata plus selected schema values into the existing API payloads.

## Source extraction safety

Server-side extraction must:

- Permit only `http` and `https`.
- Reject localhost, private, link-local, loopback, metadata-service, and internal network targets.
- Re-resolve redirects and enforce the same network rules on every hop.
- Set timeouts and response-size limits.
- Accept only supported content types.
- Sanitize parsed text and never execute remote scripts.
- Avoid returning credentials, environment variables, repository secrets, or private source content to the browser.

## Migration order

1. COSA campaign command: replace the directive textarea with source URL extraction, structured campaign selectors, and generated campaign concept cards.
2. Campaign Studio (`/dashboard/promote` and any BYOK agency campaign entry point): replace business, audience, promotion, pasted-context, and tone free-entry controls with URL extraction, searchable dictionaries, document extraction, and suggestion cards.
3. Launchpad creator/business/podcast/store interfaces: replace open-ended setup fields with source extraction and structured configuration choices.
4. Remaining active campaign, outreach, creative, sales, and orchestration views.
5. Add an automated repository check that flags newly added campaign-generation `<textarea>` elements and non-URL text inputs under enterprise workspace paths.

## Definition of done

A migrated workflow is complete only when:

- The primary campaign can be created without typing campaign prose.
- URL extraction can populate a useful initial brief.
- All categorical choices use searchable predefined options.
- Creative direction is selected from generated cards.
- Existing approval gates and API behavior are preserved.
- Empty, loading, extraction-error, and retry states are present.
- Keyboard navigation and accessible labels are implemented.
- Supported user-facing strings are localized in English, Spanish, Portuguese, Polish, and Russian.
- Typecheck and applicable tests pass.
