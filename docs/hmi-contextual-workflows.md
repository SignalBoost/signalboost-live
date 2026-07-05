# HMI / UX Rule: Contextual Approval Workflows

## Status

Mandatory architecture guidance for new UI work and refactors involving approval, review, release, preview, or confirmation screens.

## Purpose

Approval decisions are clearest when they stay inside the workflow that produced them. A single global approval destination can separate the user from the task context and make it harder to understand what is being reviewed.

SignalBoost should therefore keep approval and review actions inside the relevant product area.

## Core rule

Do not design a global end-user approval center as the default pattern.

Each product module should keep its own local approval tab, drawer, inline card, or contextual side panel within that module's navigation area.

Every local approval surface should make these points clear:

- What created the review request.
- Current status.
- What confirmation will do.
- What remains paused, locked, or waiting.
- The primary confirm action.
- The secondary hold, reject, close, or cancel action.

## Navigation mapping

### Marketing / Studio

Outreach campaigns, generated videos, creative previews, campaign previews, and publishing previews should start, process, and show local review cards inside the Marketing / Studio navigation area.

### Audit Cockpit / Cybersecurity

Audit tasks, scanner findings, repo checks, cybersecurity checks, exception alerts, and release buttons should appear inside the Audit Cockpit / Cybersecurity area.

### Console Hub

Provider setup, API keys, vault activity, data sync review, tenant infrastructure, and backend service readiness should remain inside the Console Hub area.

## Visual rule

Local approval cards should use the SignalBoost glass visual language: dark translucent panel, soft border, and background blur consistent with the existing `sb-glass` / fathom-glass pattern.

Cards should avoid dense command clusters. Prefer one primary action and one clear secondary action.

## Implementation requirements

- Keep approval UI close to the originating workflow.
- Use local tabs, drawers, cards, or contextual side panels.
- Avoid routine end-user routes such as `/approvals`, `/approval-center`, or `/global-approvals`.
- Keep module language specific to the product area.
- Make external action locks and payment/sync/deployment waiting states explicit.
- Preserve TypeScript safety.
- Keep build, typecheck, and i18n validation passing.

## Portuguese source directive

Resumo da diretriz original: cada módulo funcional deve manter sua própria aba, gaveta ou card local de aprovação dentro do respectivo espaço de navegação. Marketing/Studio mantém aprovações de campanhas, vídeos e previews. Audit Cockpit / Cybersecurity mantém aprovações e liberações de auditoria e scanner. Console Hub mantém aprovações de provedores, chaves, infraestrutura e sincronização de dados. Os cards locais devem seguir o padrão visual fathom-glass e exibir status e ações binárias de forma clara.
