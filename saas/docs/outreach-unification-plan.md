# SignalBoost Product Vision & Execution Plan (May 26, 2026)

This document replaces the previous outreach-only plan with the broader product direction and execution priorities.

## 1) Core Direction

SignalBoost is becoming an **intelligent business operating platform** for people who want outcomes, not configuration.

### What it is

- A guided platform to help users **build, launch, promote, and grow**.
- Beginner-friendly but still efficient for advanced users.
- Workflow-first: users state a goal, SignalBoost helps execute it.

### What it is not

- Not another generic chat clone.
- Not a standalone website builder.
- Not a disconnected set of AI toys.

### Product principle

- **Simple to start. Powerful to grow.**

## 2) Target Users

SignalBoost serves:

- beginners
- small businesses
- creators
- podcasters
- marketers
- independent professionals
- technical users who want speed

Design rule: users should never feel excluded or overwhelmed.

## 3) Apprentice Workshop Vision

### New core feature

- **SignalBoost Apprentice Workshop** (`/dashboard/apprentice`)
- Purpose: **learn while building** with step-by-step guided outcomes.

### Example first-goal journeys

- Build my first website
- Start my first podcast
- Get my first customers
- Create my first videos
- Collect reviews
- Send my first campaign

### UX principle

Never assume technical knowledge.

- Avoid jargon-first prompts (SEO, metadata, hosting).
- Ask user-goal language (e.g., “Do you want people to find you on Google?”).
- Keep complexity internal.

## 4) Adaptive Experience System (Planned)

Capture user comfort during onboarding:

- Never used these tools
- A little experience
- Comfortable
- Advanced

Then adapt UI/flows:

- **Beginner mode**: explanations, fewer choices, larger actions, guided path.
- **Advanced mode**: power controls, faster workflows, denser tooling.

## 5) Revenue Engine (Primary Execution Focus)

Principle: **Engine first. Cosmetics later.**

### Prospects system (implemented)

- Discovery API
- Prospects API
- Prospects dashboard
- Supabase integration
- Status updates

Flow: Find prospects -> Save to pipeline -> Manage stages.

### Outreach draft engine (implemented)

- Endpoint: `/api/outreach/draft`
- Generates AI outreach draft using:
  - category
  - location
  - website
  - opportunity score
  - assessment

Flow: Prospect -> AI outreach draft -> Campaign -> Distribution.

### Distribution engine (next major build)

In progress:

- campaign sender
- send queue
- sequences
- automation
- open tracking
- click tracking
- reply tracking

## 6) Two-Product Architecture & Unification

- `saas.signalboostapp.com` (SaaS app, Vercel: `signalboost-live`)
- `www.signalboostapp.com` (shopping-mall product, Vercel: `signalboost`)
- Shared Supabase project: `dwchaygtxubufxkzfpne`

### Unification status

- Already unified at data layer.
- Must unify outbound email capability by ensuring `RESEND_API_KEY` is present in both Vercel projects.
- Keep sender choice in shared code-level sender mapping.

## 7) Concierge Reliability (Critical)

### Observed issue

Some requests stay in “Pensando...” indefinitely instead of failing gracefully.

### Likely technical causes

- unresolved promise
- unresolved stream
- missing timeout
- loading-state exit not guaranteed

### Reliability fix requirement

- frontend request timeout
- guaranteed `finally()` cleanup
- loading-state cleanup on all exits
- fallback responses
- request abort handling

Target: fast response or clear timeout message; never infinite waiting.

## 8) Localization Status

Completed architecture direction:

- multilingual feature-copy system (EN/PT/ES/PL/RU)
- localization pass expanded beyond navigation to feature-level content

Remaining requirement:

- remove remaining English leaks in feature experiences (especially concierge and creative workflows).

## 9) Design Direction

SignalBoost UX should feel:

- clear
- guided
- safe
- modern
- intelligent
- not overwhelming

Principle: design is trust, not decoration.

## 10) Strategic Product Identity

SignalBoost should not compete directly on raw-model capability.

Positioning:

AI models -> SignalBoost intelligence layer -> guided business workflows -> real-world outcomes.

Users are buying:

- results
- simplicity
- confidence
- workflows

## 11) Immediate Priorities

### Active now

1. **Concierge reliability fix**
   - timeout
   - loading cleanup
   - fallback handling
2. **Distribution engine build**
   - send queue
   - tracking
   - sequences
3. **Apprentice progress system**
   - save experience level
   - adaptive flows
   - continue-later state
4. **Localization pass**
   - remove remaining English leaks
5. **UX improvements**
   - embedded rendering
   - reduced clutter
   - stronger visual hierarchy

## 12) Working Model

Team operating loop:

- Product/testing side: test, challenge, observe, think like users.
- Engineering side: architect, code, debug, implement.
- Shared: iterate, improve, stabilize.
