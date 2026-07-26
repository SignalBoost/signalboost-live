# SignalBoost Portable Google Play Packaging

## Current status

This repository currently provides versioned Android packaging-readiness metadata and validation only. It does not contain a generated APK or Android App Bundle, a production signing key, a Play Console application, or evidence of store publication.

## Supported shell choices

- **Trusted Web Activity (TWA):** preferred when the portable is served as an installable, HTTPS web application with a compatible web manifest, service worker, icons, and verified Digital Asset Links.
- **Capacitor:** available for portables that require a native shell or cannot meet the TWA requirements. Native plugins and permissions require separate security and privacy review.

The descriptor records the intended shell but does not invoke Bubblewrap, Gradle, Capacitor, Android Studio, bundletool, signing tools, or Play Console APIs.

## Readiness states

1. `metadata_ready` — deterministic packaging metadata exists and passes repository validation.
2. `build_ready` — required web assets, verified launch behavior, Android project configuration, and repeatable build instructions have been validated.
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

## Provider Hub reference descriptor

`saas/portable-mobile/provider-hub.android.ts` describes a future TWA package for the authenticated Provider Hub dashboard at `/dashboard/provider-hub`. It is intentionally marked `metadata_ready`.

The referenced icon paths are packaging requirements, not evidence that final store assets have been designed or approved. A later phase must add verified icon files, a web manifest, service-worker behavior, Digital Asset Links, offline/failure behavior, privacy disclosures, and authenticated-launch testing before moving to `build_ready`.

## Production responsibilities

The release owner must provide and verify:

- Play Console developer account and organization ownership;
- unique package-name availability;
- final app name, icons, screenshots, feature graphic, descriptions, category, contact details, and privacy-policy URL;
- content rating, Data Safety form, target audience, advertising declarations, and account-deletion requirements;
- approved production keystore custody or Play App Signing enrollment;
- repeatable build provenance and dependency review;
- internal, closed, or open testing evidence;
- authentication, deep-link, network-loss, back-button, accessibility, and device compatibility testing;
- store-review responses and final publication evidence.

No signing material, passwords, service-account credentials, or Play Console tokens may be committed to this repository.

## Next bounded phase

The next implementation slice should add build-readiness assets and validation for one portable only: web manifest, final icon files, Digital Asset Links template, installability checks, and authenticated launch/failure tests. It must still stop before production signing or store mutation.
