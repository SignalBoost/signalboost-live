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
- Figma is the next provider. Its official remote endpoint is `https://mcp.figma.com/mcp`; Production enablement must remain fail-closed until host-owned Figma OAuth authorization is present and live certification passes.


## Vercel provider certification — 2026-09-21

Vercel is the next Universal MCP provider after GitHub, Supabase, Context7, and governed Figma onboarding.

- Official remote server: `https://mcp.vercel.com`; iTMounts uses Vercel's project-specific endpoint form `https://mcp.vercel.com/<teamSlug>/<projectSlug>` so the remote server receives exact team/project context.
- Production configuration requires host-owned `VERCEL_MCP_OAUTH_ACCESS_TOKEN`, `VERCEL_MCP_TEAM_SLUG`, and `VERCEL_MCP_PROJECT_SLUG`. Missing OAuth or target fails closed.
- The initial allowlist is diagnostics-first and read-only: documentation search, project read, deployment listing/read, build logs, and runtime logs.
- `deploy_to_vercel`, `use_vercel_cli`, domain purchase, protected-link creation, and other mutation/consequential tools are intentionally absent pending separate authority review.
- Live Vercel certification is conditional on the three host-owned Vercel secrets being present and requires exact governed capability projection plus a real project details probe.
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
