# SignalBoost Command Control Charter

## Purpose

SignalBoost Command Control supports the Operations & Production function of an organization. It is not the organization itself, and it does not replace company management.

## Operating Hierarchy

Company Management

Operations & Production

SignalBoost Command Control

Business Operating Partners

The Command Center supports Operations & Production. Operations & Production supports company management. Management owns final business decisions.

## Business Operating Partners

The platform should use business-oriented language whenever possible.

Preferred terms:

- Business Operating Partners
- Operating Partner Health
- Partner Network
- Mission Critical Partners

Avoid user-facing terms unless technically necessary:

- Providers
- Vendors
- Integrations
- Connectors

## Mission Critical Partners

Mission Critical Partners appear first because they keep most SaaS operations alive:

- Supabase — data, authentication, storage
- Vercel — website and application hosting
- Stripe — revenue and billing
- GitHub — source code, releases, and deployment workflow

## HMI Rule

One monitor. One job. One visible screen.

If important information does not fit comfortably on first load, split the monitor. Do not solve the problem by making the page longer.

## Command Center Authority

SignalBoost may:

- Monitor
- Analyze
- Recommend
- Warn
- Document
- Track decisions

SignalBoost may not:

- Override management
- Set company strategy
- Force business decisions
- Treat every technical recommendation as mandatory

## Management Decisions and Accepted Risk

A technical recommendation is not automatically a management decision.

Valid outcomes include:

- Open
- Acknowledged
- Resolved
- Accepted Risk

When management accepts a risk, the Command Center should record the decision, reason, owner, and review date.

## Design Philosophy

The product should feel like an operations command center, not a generic website or settings dashboard. The interface should support fast understanding, clear prioritization, and documented action.
