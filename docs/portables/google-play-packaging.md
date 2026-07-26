# SignalBoost Portable Google Play Packaging

## Current status

This repository provides versioned Android packaging metadata, build-readiness assets, and validation for the Provider Hub portable. It does not contain a generated APK or Android App Bundle, a production signing key, a Play Console application, or evidence of store publication.

## Supported shell choices

- **Trusted Web Activity (TWA):** preferred when the portable is served as an installable, HTTPS web application with a compatible web manifest, service worker, icons, and verified Digital Asset Links.
- **Capacitor:** available for portables that require a native shell or cannot meet the TWA requirements. Native plugins and permissions require separate security and privacy review.

The descriptor records the intended shell but does not invoke Bubblewrap, Gradle, Capacitor, Android Studio, bundletool, signing tools, or Play Console APIs.

## Readiness states

1. `metadata_ready` — deterministic packaging metadata exists and passes repository validation.
2. `build_ready` — required web assets and bounded launch/failure behavior have been validated in the repository.
3. `signed_bundle_ready` — an AAB has been produced with an approved production signing process and the evidence has been retained outside source control.
4. `play_console_published` — Play Console publication has been completed and verified.

A later state must never be claimed solely because an earlier state passes.

## Required metadata

Each portable descriptor must include:

- stable portable identifier and app name;
- reverse-domain Android package name;
- HTTPS launch URL with no embedded credentials;
- TWA or Capacitor shell choice;
- display mode and orientation;
- at least one icon and one maskable icon of at least 192x192;
- explicit signing and distribution evidence flags;
- visible notices describing what has not been built, signed, or published.

## Provider Hub build-ready evidence

`saas/portable-mobile/provider-hub.android.ts` describes the TWA package for the authenticated Provider Hub dashboard at `/dashboard/provider-hub` and is marked `build_ready`.

The bounded repository evidence includes:

- `saas/public/provider-hub.webmanifest`;
- repository-owned standard and maskable SVG icons;
- `saas/public/provider-hub-sw.js` with navigation-only failure handling;
- `saas/public/provider-hub-offline.html` with an explicit no-action failure message;
- a credential-free Digital Asset Links template at `saas/public/.well-known/assetlinks.template.json`;
- deterministic tests for authenticated launch, unauthenticated redirect, network failure, offline failure, Android back navigation, asset presence, and non-production boundaries.

The Digital Asset Links file remains a template. The release owner must replace the placeholder with the approved Play App Signing SHA-256 certificate fingerprint during a controlled release process. No fingerprint, signing material, or credential is committed.

## Production responsibilities

The release owner must provide and verify:

- Play Console developer account and organization ownership;
- unique package-name availability;
- final screenshots, feature graphic, descriptions, category, contact details, and privacy-policy URL;
- content rating, Data Safety form, target audience, advertising declarations, and account-deletion requirements;
- approved production keystore custody or Play App Signing enrollment;
- repeatable build provenance and dependency review;
- internal, closed, or open testing evidence on representative Android devices;
- authentication, deep-link, network-loss, back-button, accessibility, and device compatibility testing;
- store-review responses and final publication evidence.

No signing material, passwords, service-account credentials, or Play Console tokens may be committed to this repository.

## Next bounded phase

The next slice may validate a repeatable unsigned TWA project build from these assets and retain build provenance. It must still stop before production signing, Play Console upload, rollout, or publication.
