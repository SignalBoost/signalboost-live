# Browser-Agent Adapter Catalog

The catalog is portable and production-disabled by default. Several adapters have real host-neutral implementations; vendor packages/accounts/browser processes remain buyer- or host-owned. MCP browser servers are integrated through the governed Provider Hub registry and a host-owned transport, not by granting remote self-description authority.

| Target | Category | Likely port mappings | Deployment/language | Enterprise controls | Status |
|---|---|---|---|---|---|
| Browserbase | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Steel | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Hyperbrowser | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| AWS Bedrock AgentCore Browser | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Azure Playwright | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| BrowserStack | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Sauce Labs | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| LambdaTest | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Apify | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Bright Data | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Oxylabs | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Stagehand | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Browser Use | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Notte | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Skyvern | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Playwright | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Puppeteer | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Selenium Grid | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Playwright MCP | agent loop | governed MCP tools + browser evidence | stdio / local or self-hosted | exact scope, origin policy, read/write mapping, approvals | host transport required; not production enabled |
| Chrome DevTools MCP | agent loop | DevTools diagnostics + governed browser interaction | stdio / local or self-hosted | exact scope, origin policy, read/write mapping, approvals | host transport required; not production enabled |
| agent-browser | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| UiPath | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Automation Anywhere | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Microsoft Power Automate | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Firecrawl | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Private Browser Fleet | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |
| Custom Browser Agent | see descriptor | declared portable ports only | buyer-selected | tenant isolation, origin policy, evidence, approvals | metadata-only; host adapter required; not production enabled |


## Governed browser MCP profiles

Provider Hub now carries first-class profiles for **Playwright MCP** and **Chrome DevTools MCP** in `saas/provider-hub-host/browser-mcp-profiles.ts`.

The profiles are deny-by-default. Remote MCP self-description never grants authority. Diagnostic tools such as accessibility snapshots, screenshots, console inspection, network inspection, CSS inspection, Lighthouse and performance traces map to read capabilities. Navigation, clicks, typing, form fill, dialogs and other browser interaction map to write capabilities and require the existing Portable Connector Runtime approval gate.

The default profiles deliberately do **not** expose arbitrary Playwright code execution, file upload, Chrome extension mutation, PWA installation, third-party developer-tool execution, or nested WebMCP execution.

Both upstream browser MCP servers use stdio. SignalBoost stores only a logical `transportRef`; process lifecycle, Chrome/Playwright installation and any authentication remain host-owned. Exact approved-origin enforcement remains mandatory in the host/browser boundary. Upstream Playwright's own `--allowed-origins` option is defense in depth only and is not treated as the platform security boundary.
