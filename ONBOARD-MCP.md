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
