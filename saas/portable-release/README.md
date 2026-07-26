<!-- saas/portable-release/README.md -->

# Portable releases

A portable is not sellable because its code works. It is sellable when a buyer
can receive a versioned archive, verify it, read what it needs, install it
without contacting us, and prove in their own environment that it does what we
said it does.

This directory holds one release spec per portable. `scripts/package-portable.mjs`
turns a spec into that archive.

## Building a release

From `saas/`:

```sh
node scripts/package-portable.mjs portable-release/self-healing.release.json
```

Output lands in `dist/portables/<id>/<version>/`.

## What the packer will not let you ship

The packer does not trust a hand-written file list. It walks the real import
graph from the portable's declared buyer entry points and copies exactly the
modules a buyer would load. Five gates block a release:

**Unresolvable imports.** If the graph reaches a specifier that cannot be
packaged and is not declared in `hostFallbacks`, the release blocks and prints
the exact specifier and the file that imports it. A buyer extracting the archive
would have hit that same broken import — better it stops here.

**Undeclared platform naming.** If our own name appears in a payload file that
is not declared in `knownNamingExceptions`, the release blocks. Our name in a
buyer's evidence records, logs and SIEM is what a security reviewer greps for.
Tracked exceptions carry a written reason, and that reason is copied into
`manifest.json` so the reviewer reads the justification in the artifact.

**A short graph walk.** If fewer modules are reached than the spec expects, the
release blocks. A short walk means an entry point moved or an import style
changed — it must not ship a partial payload that fails at the buyer's site.

**Escaping the payload root.** If the graph reaches a module outside the
portable's declared boundary, the release blocks rather than silently widening
what we are selling.

**A non-semantic version.** A version is a compatibility promise. It has to
parse as one.

## First run of a new spec

Leave `hostFallbacks` empty. The first run will block and print every bare or
aliased specifier the graph actually reaches. Only the specifiers it prints go
in the list — never a guess — and each one gets a matching line in
`buyerMustSupply` saying what the buyer provides instead.

## What the buyer receives

| File | Purpose |
| --- | --- |
| `payload/` | Exactly the modules in the buyer import graph. |
| `manifest.json` | Version, source commit, per-file SHA-256, entry points, runtime dependencies, what the buyer supplies, what is not included, supported platforms, upgrade policy, known limitations, acceptance instructions. |
| `SHA256SUMS` | Verifiable from the archive root with `sha256sum -c`. |
| `sbom.json` | CycloneDX 1.5. |
| `package.json` | Entry points, engines, peer dependencies. |
| `RELEASE-NOTES.md` | Written for the buyer, not for us. |
| `<id>-<version>.tgz` + `.sha256` | The archive and its checksum. |

## Version discipline

A release candidate is code that passes every gate. A `1.0.0` is a release
candidate that some environment other than ours has installed and passed
acceptance in. Do not drop the `-rc` suffix, and do not set a manifest's
`licensingAvailable` to true, until that has actually happened.
