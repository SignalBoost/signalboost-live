# SignalBoost NASA-Style HMI Design System

## Token definitions

| System | Token examples | Purpose |
| --- | --- | --- |
| Typography | `--sb-font-heading`, `--sb-font-body`, `--sb-font-weight-light`, `--sb-font-weight-medium`, `--sb-font-weight-bold`, `--sb-line-height-body` | Keeps Orbitron/Exo-style headings, Inter/Roboto-style body copy, readable line heights, and approved weights consistent. |
| Colors | `--sb-bg-gradient`, `--sb-color-primary-neon`, `--sb-color-secondary-neon`, `--sb-color-accent-neon`, `--sb-color-text`, `--sb-color-text-muted` | Defines the black-to-deep-navy cockpit background and gold/cyan/magenta neon palette. |
| Spacing | `--sb-space-xs`, `--sb-space-sm`, `--sb-space-md`, `--sb-space-lg`, `--sb-space-xl` | Provides 4px, 8px, 16px, 24px, and 32px spacing for margins, padding, and grid gaps. |
| Shadows and glows | `--sb-shadow-neon`, `--sb-shadow-panel-token`, `--sb-shadow-hover-gold`, `--sb-shadow-hover-cyan`, `--sb-shadow-hover-magenta` | Standardizes current-color neon, panel depth, and hover glows. |
| Cockpit effects | `--sb-glass-background`, `--sb-glass-blur`, `--sb-transition-hover` | Standardizes glassmorphism panels and 200ms ease-in-out hover transitions. |

## Wireframe previews

### Marketplace homepage

```text
┌────────────────────────────────────────────────────────────┐
│ SignalBoost mission marketplace                            │
│ H1: Find the next growth maneuver...                       │
│ ┌ Search services and partners ─────────────── [Open] ┐    │
│ └──────────────────────────────────────────────────────┘    │
│ ═════ telemetry strip ═════ telemetry strip ═════          │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Launch panel │ Trust panel  │ Operate      │ Partner chips │
└──────────────┴──────────────┴──────────────┴───────────────┘
```

### SaaS dashboard cockpit

```text
┌──────────────── Workspace modules ────────────────┐
│ Module rail │ Active module telemetry card         │
│ Promote     │ Tasks · AI suggestions · Results     │
│ Reviews     │ CTA into selected SaaS workspace     │
└─────────────┴──────────────────────────────────────┘
┌ Concierge bar ┐ ┌ Prompt panel ┐ ┌ Quick actions ┐
└───────────────┘ └──────────────┘ └───────────────┘
```

### Pricing cockpit cards

```text
┌ Pricing hero glass panel ┐
├────────┬─────────┬────────┬──────────┤
│ Free   │ Starter │ Pro ★  │ Business │
│ CTA    │ CTA     │ Glow   │ CTA      │
└────────┴─────────┴────────┴──────────┘
┌ Service pricing cards mapped to direct dashboard CTAs ┐
└────────────────────────────────────────────────────────┘
```

## QA coverage

- `tests/designTokens.test.ts` verifies token definitions and confirms tokenized cockpit classes are applied across the Marketplace homepage, SaaS dashboards, pricing page, and data connector CRM pipeline.
- `npm test` includes the design token regression alongside existing i18n, reviews, outreach, concierge, and CRM telemetry checks.
