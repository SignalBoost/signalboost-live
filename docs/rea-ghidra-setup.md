# Ghidra setup for iTMounts REA research workers

This is **host tooling**, not a Next.js runtime dependency. Run the installer only on an isolated, authorized analysis worker, not during a request or build.

## Installation and smoke test

Install 64-bit JDK 25 and configure `JAVA_HOME` and `PATH`. Then from the repository root:

```bash
bash scripts/install-ghidra-rea.sh
bash scripts/verify-ghidra-rea.sh
```

The installer downloads the official **Ghidra 12.1.4** release from the NSA-maintained GitHub repository, pins SHA-256 `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`, validates the archive, and installs to `$HOME/.local/opt/ghidra` (overridable through `GHIDRA_INSTALL_ROOT`). It refuses to overwrite an existing installation.

The verifier requires a real `support/analyzeHeadless` script and a recognizably functioning Java 25-backed startup. Merely committing the installer or passing static source tests is **not** proof that it has run on a production host.

## Division of work

Use REA's documented Electron/JavaScript analysis for authorized desktop application bundles. Ghidra is for compiled native components when justified by evidence. Record version, hash, analysis source, observations, limitations, and independently written iTMounts acceptance tests. Do not upload proprietary extracted code or credentials.

**Status:** Installation is reproducible in the repository, but host deployment and the Ghidra smoke test have not been verified. For integration with the Cursor research workflow see `docs/rea-cursor-builder-investigation.md` and `scripts/rea-cursor-inspect.mjs`.
