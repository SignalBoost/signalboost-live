# Ghidra for iTMounts REA research

Ghidra is a **research-side tool**, not a customer-facing SaaS process. Run it on a disposable Linux research worker or workstation with an authorized local binary, not on the production web server. It complements REA's JavaScript/Electron analyzer and does not replace its behavioral probes.

## Official installation

1. Provision a 64-bit JDK **25** research worker (verify `java -version`).
2. From the repository root run `bash scripts/install-ghidra-rea.sh`.
3. The installer discovers only the official **12.1.4** binary asset for release tag `Ghidra_12.1.4_build`, checks its published SHA-256 before extraction and never overwrites an existing installation.
4. Headless executable: `~/.local/opt/ghidra/support/analyzeHeadless`. Inspect the official documentation before using it.
5. Preserve results in private, access-controlled local evidence storage and produce independent feature specifications and acceptance tests. Do not commit analyzed third-party binaries, recovered code, credentials, or raw proprietary assets to the product repository.

**Status:** Installer committed but no installation on any production/research machine is evidenced by this change. This repository's REA Cursor protocol remains `docs/rea-cursor-builder-investigation.md`. Ghidra is useful for native modules only; it will not reveal Cursor's private cloud agent algorithms and must not be treated as a substitute for observed agent execution.

**Security:** Use authorized copies, do not bypass service authentication or access controls, and keep binary investigation isolated from tenants and production secrets. Review official Ghidra security advisories before deploying a specific release.

**Validation:** Run `bash -n scripts/install-ghidra-rea.sh`; installation must refuse execution on hosts without Java 25, and a real installation succeeds only after archive checksum verification and confirmation that `support/analyzeHeadless` exists.
