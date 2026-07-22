# Render Module — Architecture & Integration

> Read `ONBOARD.md` first. This document is indexed from ONBOARD Section 12D and
> follows the portable `*-core` / `*-host` pattern described in
> `saas/console-core/README.md`. Where this document and `ONBOARD.md` disagree,
> `ONBOARD.md` wins and this file must be corrected in the same change.

The Render Module turns a render request into a stored asset through one fixed
pipeline, with provider cost and payment handled the same way every time. It is
the first sellable portable: a buyer takes `render-core`, writes three thin
adapters, and has a metered render service on their own infrastructure.

## The split

| Package | Contains | May import |
| --- | --- | --- |
| `saas/render-core/` | Contracts, engine, provider executors | Nothing from the host app |
| `saas/render-host/` | SignalBoost's adapters | Supabase, credits ledger, storage |

`render-core` has no knowledge of Supabase, Next.js, auth, or the credits system.
That is the entire point — a buyer replaces `render-host` and keeps the engine.

## Pipeline
