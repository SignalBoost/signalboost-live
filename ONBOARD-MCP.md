# MCP Compatibility Onboarding Supplement

Read root `ONBOARD.md` first, then `docs/HANDOFF-PROVIDER-HUB-MCP-2026-08-31.md`, `docs/HANDOFF-PROVIDER-HUB-MCP-PHASE2-2026-08-31.md`, and `docs/HANDOFF-PROVIDER-HUB-MCP-PHASE3-2026-08-31.md` before changing MCP, Agent Gateway, Provider Hub, connector, or portable integration code.

Current workstream: **Provider Hub MCP compatibility — Phase 3 shared connection registry active; not Production-accepted.**

Direction: retain SignalBoost governance/Provider Hub as the authority layer; generalize the existing MCP implementation as a compatibility layer for COS and explicitly authorized portables/software.

- Phase 1 (merged in PR #1722): exact-scope read-only Provider Hub capability projection through the existing governed MCP server.
- Phase 2 (merged in PR #1723): host-neutral outbound MCP client + Provider Hub discovery/execution adapter for explicitly configured external MCP servers.
- Phase 3 (active): shared deny-by-default MCP server/portable assignment registry so approved MCP servers and exact tool mappings can be reused without per-portable custom code.
- Remote MCP self-description is never authorization. Tool exposure requires exact host mapping to tenant, environment, portable, provider, connection, risk, approval rule, scopes, and schema.
- Credentials/authentication remain host-owned; MCP core and registry store none.
- Write/consequential capabilities remain subject to existing Portable Connector Runtime approval/audit gates and are never auto-authorized merely because an MCP server advertises them.


## Builder Universal MCP read seam — 2026-09-21/22

The durable Builder execution path now has a host-governed read-only Universal MCP seam rather than merely testing Universal MCP with `portableId=builder`.

- `saas/lib/builder/mcp-read-port.ts` projects only capabilities whose host profile risk is `read`; GitHub writes/merge/actions, Supabase SQL/migrations/functions, Figma mutation, and every other write/consequential capability are absent from Builder's MCP tool loop.
- Builder receives the exact configured capability catalog and may invoke it only through `mcp_read`; provider id and capability id must exactly match the host allowlist.
- Context7 is safe for ordinary Builder sessions because it is public documentation. GitHub, Supabase, Figma, and Vercel currently use host-owned iTMounts credentials, so those reads are projected only into owner-authorized Builder jobs. Customer Builder sessions must never inherit iTMounts host credentials.
- Figma screenshots and Supabase publishable-key retrieval are intentionally excluded from the Builder text-control seam.
- MCP payloads are bounded turn-local evidence. Raw MCP result payloads are not persisted into Builder checkpoints; a resumed job must re-read current evidence through the governed port. Final public Builder traces retain only the existing sanitized metadata shape.
- This seam does not grant repository writeback, database mutation, deployment authority, design mutation, browser interaction, or credential access. Platform Engineer and existing approval/audit boundaries remain authoritative for those actions.
- Production acceptance still requires the exact Builder regression plus provider live certification. A configured profile or successful unit test is not runtime acceptance.


## Browser MCP tools — 2026-09-21

Playwright MCP and Chrome DevTools MCP are now first-class governed browser-tool profiles for COS / Software Specialist / Builder-style portables.

- Canonical profiles: `saas/provider-hub-host/browser-mcp-profiles.ts`.
- Playwright MCP package contract is pinned to `@playwright/mcp@0.0.82`; Chrome DevTools MCP is pinned to `chrome-devtools-mcp@1.9.0`. Both are stdio-first and use host-owned logical `transportRef` values.
- Remote MCP tool discovery is never authorization. Only the exact tools mapped by the profile can become Provider Hub capabilities.
- Read-only diagnostics (snapshot, screenshot, console, network, CSS/Lighthouse/performance where applicable) do not require write approval.
- Navigation, click/type/form/dialog and other interaction tools are `write` capabilities and require the existing Portable Connector Runtime approval gate.
- Arbitrary Playwright code execution, file upload, Chrome extension/PWA mutation, third-party developer-tool execution and nested WebMCP execution are absent from the default allowlist.
- Exact approved-origin enforcement remains a host/browser security boundary. An upstream server's own allow-origin setting is defense in depth, not authorization.
- These profiles do not install npm packages, launch Chrome, store credentials, or make Production enablement claims. The host transport/process lifecycle and Production acceptance remain separate evidence-gated work.


## Builder Playwright CLI lane — 2026-09-21

Builder now has a separate governed Playwright CLI diagnostic lane in addition to Playwright MCP and Chrome DevTools MCP.

- Canonical host: `saas/lib/builder/playwright-cli-port.ts`.
- The host pins `@playwright/cli@0.1.21`; this lane is optimized for short, token-efficient coding-agent browser loops while MCP remains the structured long-lived browser integration.
- Only owner-authorized Builder jobs receive this lane initially.
- The Builder model receives a structured host allowlist only: `open`, `goto`, `snapshot`, `find`, `console`, `requests`, and `close`.
- Arbitrary Playwright code/eval, shell commands, form fill/type/click, uploads, downloads, extension attachment, persistent profiles, and off-origin navigation are not exposed.
- The CLI package and Chromium are bootstrapped in an isolated Vercel Sandbox before any model-supplied action. Bootstrap may use network access only before model input reaches the browser lane; the sandbox firewall is then reduced to the exact approved target hosts.
- The Sandbox bootstrap must install Chromium through the exact Playwright build bundled by the pinned `@playwright/cli` package and must pin the CLI config to that verified executable path. Builder browser sandboxes use the Vercel managed Ubuntu Node 24 image (`vercel/sandbox/node:24`), never the legacy `runtime: 'node24'` compatibility path. On that managed image, Playwright's pinned `install-deps chromium` runs through the SDK-owned `runCommand(..., sudo: true)` boundary; the exact bundled Chromium binary is then downloaded unprivileged and must execute a `--version` probe before model access. A bootstrap failure must destroy the half-initialized Sandbox so a later Builder round starts from a clean Sandbox. Do not rely on a default Chrome channel or a separately-versioned Playwright install; either can produce a false `browser_not_installed` failure even when another Chromium binary exists.
- The pinned CLI auto-loads `.playwright/cli.config.json` from the Builder workspace. The host must not replay `--config` on every session command; doing so can invalidate post-open commands such as `snapshot`, `console`, and `requests`. Configuration is written once during bootstrap, then ordinary commands reuse the named session through `PLAYWRIGHT_CLI_SESSION`.
- Playwright's own allowed-origin setting is defense in depth only. The Vercel Sandbox egress firewall is the network security boundary and remains host-owned.
- Browser CLI output is bounded turn-local diagnostic evidence. Raw page evidence and element refs are removed from durable Builder checkpoints so a resumed job must establish fresh browser state.
- Default navigation origins are `https://itmounts.com` and `https://www.itmounts.com`; deployments may narrow or extend them only through host-owned `BUILDER_PLAYWRIGHT_CLI_ALLOWED_ORIGINS`.
- `tests/builderPlaywrightCli.node.test.ts` is mandatory in the Vercel gate and proves owner-only exposure, off-origin rejection before sandbox creation, bootstrap-before-lockdown ordering, shell non-exposure, Builder reasoning consumption, and checkpoint scrubbing.
- Production proof uses a distinct CRON_SECRET-protected owner canary queue marker, `builderPlaywrightCliCanary`; it is not a public trigger and is not relabeled as Self-Healing repair work. Because browser state and browser evidence are deliberately scrubbed from Builder checkpoints, this owner-only canary executes `open → snapshot → console → requests → close` deterministically in one claimed job slice instead of relying on multi-slice model reasoning. Persisted canary evidence records only `action`, `ok`, `exitCode`, `timedOut`, and an optional bounded failure code—never URL, page content, cookies, headers, prompts, stdout, stderr, or browser state.

## Browser MCP live host — 2026-09-21

A concrete host-owned stdio runtime is now implemented for browser MCP servers. The reference execution environment is GitHub Actions because long-lived Chrome/stdin processes are not a Vercel serverless responsibility.

- `mcp-stdio-transport.ts` owns one bounded child process for an MCP session, sends `notifications/initialized`, correlates JSON-RPC responses, bounds output and terminates the child explicitly.
- `browser-mcp-stdio-host.ts` is the runtime security boundary: registry metadata cannot choose arbitrary commands, remote discovery is filtered again, filesystem-writing/script arguments are rejected, and explicit navigation URLs are checked before execution.
- Chrome DevTools MCP is pinned to `1.9.0`; Playwright MCP is pinned to `0.0.82`.
- Chrome runs isolated/headless with JavaScript evaluation disabled, network headers redacted, usage statistics disabled, CrUX disabled, and machine-readable structured MCP results enabled.
- The live reference host exposes diagnostics plus bounded page navigation only. Click/type/fill/upload/arbitrary evaluation remain unavailable there even though broader governed mappings may exist for future reviewed hosts.
- Chrome's structured page evidence is authoritative for page id/final URL. After `new_page` or `navigate_page`, the host verifies the final page origin and terminates the process if a redirect escaped the approved origin set.
- `.github/workflows/chrome-devtools-mcp-live-acceptance.yml` launches the real pinned server and Chromium and probes only approved iTMounts origins through Provider Hub and Portable Connector Runtime.
- Retained acceptance evidence is metadata-only: page text, console bodies, network headers, screenshots, prompts and credentials are not persisted.
- The first live run on PR #2696 correctly exposed a brittle text parser after Chrome DevTools MCP changed titled page rendering. The repair uses `structuredContent.pages`; live acceptance must pass on the repair revision before the runtime is called accepted.


## Universal MCP Gateway — GitHub, Supabase, Context7 — 2026-09-21

The first non-browser production MCP provider set is implemented through the existing Phase 2/3 Provider Hub boundary. These are real remote MCP integrations, not catalog placeholders.

Architecture:

```text
COS / authorized portable / owner console
→ Universal MCP Gateway
→ exact tenant + environment + portable assignment
→ Portable Connector Runtime
→ explicit host tool mapping
→ host-owned Streamable HTTP transport
→ GitHub / Supabase / Context7 remote MCP
```

Canonical implementation:
- `saas/provider-hub-host/universal-mcp-profiles.ts` — exact deny-by-default tool and risk catalog.
- `saas/provider-hub-host/mcp-streamable-http-transport.ts` — HTTPS-only remote transport with bounded responses, redirect rejection, session compatibility, and host-owned authentication.
- `saas/provider-hub-host/universal-mcp-gateway.ts` — executable gateway, credential readiness, project/repository scoping, Portable Connector Runtime approval/audit integration.
- `saas/provider-hub-host/mcp-gateway-audit.ts` + `provider_hub_mcp_audit` — durable metadata-only execution evidence; arguments, results and credentials are never persisted.
- `/api/admin/provider-hub/mcp` — owner-authenticated discovery and invocation surface. Caller-supplied approval identity is rejected by construction; an explicit `approve: true` is converted into approval evidence owned by the authenticated owner identity.

Provider contracts:
- GitHub remote MCP: `https://api.githubcopilot.com/mcp/`. Only the exact configured tools are requested with `X-MCP-Tools`; lockdown mode is enabled as defense in depth. The host remains the authorization boundary. GitHub operations are additionally constrained to `MCP_GITHUB_ALLOWED_REPOS` (default for this deployment: `SignalBoost/signalboost-live`). Code search is automatically repository-qualified; cross-repository qualifiers are rejected.
- Supabase remote MCP: `https://mcp.supabase.com/mcp`, project-scoped with `project_ref` and bounded feature groups. `SUPABASE_ACCESS_TOKEN` is the management credential; a database service-role key is not substituted for it. The project ref is read from `SUPABASE_MCP_PROJECT_REF` or derived from the configured Supabase URL. Missing credential/ref fails closed.
- Context7 remote MCP: `https://mcp.context7.com/mcp`. Exact tools are `resolve-library-id` and `query-docs`; both are read-only. `CONTEXT7_API_KEY` is optional because anonymous service access is supported, with lower provider-side limits.

Risk policy:
- Read capabilities require no mutation approval.
- GitHub branch/file/issue/PR writes require explicit approval.
- GitHub merge/workflow triggers and Supabase raw SQL/migrations/Edge Function deployment are `consequential`: explicit approval plus a buyer/platform audit sink are mandatory.
- Remote MCP annotations and descriptions never grant authority or lower a host classification.
- Arbitrary registry discovery and arbitrary remote endpoints are not supported.

Acceptance:
- `npm run test:mcp-gateway` is mandatory in the main test suite.
- `.github/workflows/universal-mcp-live-acceptance.yml` performs real remote acceptance against Context7, the private SignalBoost GitHub repository, and the scoped Supabase project.
- Supabase live acceptance deliberately fails when `SUPABASE_ACCESS_TOKEN` is unavailable; it never converts a missing credential into a skipped/green result.


## MCP provider certification framework — 2026-09-21

MCP onboarding now has a provider-neutral certification layer rather than relying on one-off acceptance logic for each integration.

- `saas/provider-hub-host/mcp-certification.ts` defines the reusable fail-closed certification contract.
- Certification requires provider readiness, an exact governed capability projection, and explicit positive/negative probes.
- Certification evidence is metadata-only: probe arguments, remote results, credentials, and provider error bodies are never retained.
- GitHub MCP is the first provider wired through this framework. Its live certification verifies the exact host-approved capability set, a real read of `SignalBoost/signalboost-live`, and rejection of an off-scope repository.
- `npm run test:mcp-gateway` includes certification regression coverage.
- `.github/workflows/universal-mcp-live-acceptance.yml` is the live evidence gate. Do not describe GitHub MCP as Production-certified until that workflow passes on the candidate revision.


## Supabase + Context7 provider certification — 2026-09-21

The shared MCP certification framework now covers all three implemented Universal MCP providers.

- Supabase certification requires the management credential, exact governed capability projection, and a real project-scoped table read.
- Context7 certification requires the exact two governed documentation capabilities and a real library resolution call.
- GitHub, Supabase, and Context7 produce the same metadata-only certification report shape.
- A missing Supabase credential remains a hard failure for live acceptance; it is not converted into a skip.
- Figma is part of the required Universal MCP Production set. Its official remote endpoint is `https://mcp.figma.com/mcp`. As of 2026-09-22, Figma documents that only clients in the Figma MCP Catalog can connect; a new custom MCP client must obtain provider approval first. iTMounts therefore reports `provider_client_approval_required` and stays fail-closed. A legacy/static `FIGMA_MCP_OAUTH_ACCESS_TOKEN` must not enable the provider. The HTTP transport accepts an async host-owned authorization resolver so, after Figma approves iTMounts, the authenticated user's OAuth connection can be resolved/refreshed from the server-side encrypted vault rather than copied into Vercel or GitHub secrets.


## Vercel provider certification — 2026-09-21 / OAuth lifecycle correction 2026-09-25

Vercel is part of the required Universal MCP Production set after GitHub, Supabase, Context7, and governed Figma onboarding.

- Official remote server: `https://mcp.vercel.com`; iTMounts uses Vercel's project-specific endpoint form `https://mcp.vercel.com/<teamSlug>/<projectSlug>` so the remote server receives exact team/project context.
- Vercel MCP is an OAuth-protected resource and Vercel keeps an allowlist of approved MCP clients/redirect URIs. iTMounts remains fail-closed until that provider-side client approval exists.
- `VERCEL_MCP_TEAM_SLUG` and `VERCEL_MCP_PROJECT_SLUG` are host-owned routing context. A copied/static `VERCEL_MCP_OAUTH_ACCESS_TOKEN` environment variable is legacy and must not enable the provider.
- The runtime accepts only a host-owned asynchronous Vercel authorization resolver with `clientApproved=true`, `connected=true`, and a per-request access-token resolver. That resolver is the seam for encrypted refresh-token storage and automatic renewal; token material is never stored in MCP registry metadata or exposed to the model.
- The initial allowlist is diagnostics-first and read-only: documentation search, project read, deployment listing/read, build logs, and runtime logs.
- `deploy_to_vercel`, `use_vercel_cli`, domain purchase, protected-link creation, and other mutation/consequential tools are intentionally absent pending separate authority review.
- A prior isolated Preview on 2026-09-22 proved the governed project-read path, but that does not establish a durable Production OAuth lifecycle. Current certification status is `blocked_external` until Vercel approves the iTMounts client/redirect URI and the host-owned refreshable connection completes live acceptance.
- Full Universal MCP acceptance requires GitHub, Supabase, Context7, Figma, and Vercel to certify on the same candidate revision; a green run may not omit Figma or Vercel.
- Remote tool discovery never expands the host allowlist or project scope.


## Browser MCP CI sandbox repair — 2026-09-21

The governed browser MCP live host now carries an explicit isolated-runner sandbox launch policy.

- The previous Playwright live acceptance reached Provider Hub successfully but Chromium terminated because its sandbox could not initialize on the Actions host.
- The previous Chrome DevTools MCP live acceptance failed with the corresponding opaque `Target closed` launch failure.
- `isolatedBrowserMcpSandboxArgs()` centralizes the package-supported overrides used only by the isolated browser host:
  - Playwright MCP: `--no-sandbox`
  - Chrome DevTools MCP: `--chrome-arg=--no-sandbox` and `--chrome-arg=--disable-setuid-sandbox`
- This does **not** widen Provider Hub capability projection, approved origins, filesystem access, credentials, or Portable Connector Runtime authority.
- Regression coverage pins the exact launch policy in `saas/tests/portableBrowserAdapterCatalog.node.test.ts`.
- Playwright and Chrome DevTools MCP must each pass their real live acceptance workflow on the repair revision before they are described as functional.


## Playwright MCP Production certificate — 2026-09-24

The governed Playwright MCP runtime has a separate Production certificate path in addition to GitHub Actions live acceptance.

- `saas/provider-hub-host/playwright-mcp-sandbox-acceptance.ts` launches the exact pinned `@playwright/mcp@0.0.82` and the Chromium runtime owned by that package's exact Playwright dependency inside an ephemeral Vercel Sandbox; do not mix in a loose `@playwright/test` runtime.
- The certificate proves exact Provider Hub projection, approval/origin enforcement, MCP initialization/discovery, approved iTMounts navigation, accessibility snapshot, console diagnostics, network diagnostics, and screenshot execution. It launches with `--no-webmcp` so experimental page-registered WebMCP tools cannot expand the host-projected tool surface. The governed runtime profile itself also includes `--no-webmcp`; this is a runtime invariant, not merely a canary setting.
- `/api/cron/playwright-mcp-live-acceptance` is Production-only and `CRON_SECRET` protected. It retains only bounded metadata; page bodies, console bodies, network headers, screenshots, and credentials are not persisted. A successful certificate is bound to the exact Production commit and deployment fingerprint before it can be skipped on later cron ticks.
- The Sandbox starts deny-all, opens only for bootstrap, then narrows egress to the approved iTMounts hosts before live browser execution and is always destroyed afterward.
- `tests/playwrightMcpProductionAcceptance.node.test.ts` is mandatory in `vercel-cos-gates.mjs`. A green build without that regression is not sufficient evidence.
- The Production certificate cron is eligible every minute, but the route is idempotent per exact `VERCEL_GIT_COMMIT_SHA` plus deployment fingerprint and records the successful metadata-only receipt in `supervisor_audit_events`. Already-certified deployments skip the Sandbox, so fast-moving `main` gets prompt exact-deployment certification without repeatedly launching Chromium.
- Playwright MCP may be called Production-certified only after an exact deployed revision records every required certificate check as passed. Generic portable-browser catalog entries remain production-disabled by default and do not independently grant browser authority.
