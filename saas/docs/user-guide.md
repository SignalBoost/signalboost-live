# User Guide

A non-technical walkthrough of the console for everyday use: signing in, running
actions, reading logs, and switching between providers. No coding required.

---

## Signing in

Open the app at your organization's URL and sign in with either:

- **Google** — one click with your work Google account, or
- **Email & password**.

What you can see and do depends on your role (owner, admin, or member). If you're
new, you may be guided through a short **onboarding** flow the first time.

---

## Finding your way around

- **Dashboard** — your day-to-day overview, with cards for each module (Promote,
  Reviews, Calendar, and so on). The numbers on these cards are live, drawn from
  your own data.
- **Hub Console** (`/hub`) — the operations cockpit where you manage your
  connected services (payments, hosting, database, source control, AI providers,
  and more).

---

## Using the Hub Console

The console groups providers into four tiers:

| Tier | What's in it |
|---|---|
| **Core** | Primary infrastructure — payments, database, hosting, source control. |
| **Scale** | Messaging, email, edge networking. |
| **Enterprise** | App platform, monitoring, error tracking, incident response. |
| **Internal** | Encrypted secrets vault and team governance. |

Each provider appears as a **card** showing its available actions.

### Running an action

1. Find the provider's card (or open its **Workspace** for the full list).
2. Click the action you want — for example "View Products" or "List Repos."
3. If the action needs input (like a name or value), fill in the short form.
4. Confirm to run it. The result appears in the console.

### Live vs. coming-soon

- Actions you can run look normal and are clickable.
- Actions or providers that aren't available yet appear **dimmed with a "Soon"
  badge**. These are previews of what's coming and can't be triggered — so you'll
  never click something that doesn't work.

### Approvals

Some actions are sensitive (deleting a product, emptying a storage bucket,
changing environment variables). These require the right permission level:

- **Read/view** actions are available to anyone signed in with console access.
- **Changes** require an **admin**.
- **High-risk/destructive** actions require an **owner** and are recorded.

If you don't have the required role, the action is declined with a clear message —
that's by design.

---

## Switching providers

Use the console's tier sidebar (Core / Scale / Enterprise / Internal) to move
between provider groups, and click any card's **Workspace** to focus on a single
provider and see all of its actions in one place. Use the breadcrumb (Hub Home →
Tier → Provider) to navigate back.

---

## Reading logs and history

- **Logs** — runtime logs from your deployment, for spotting errors and activity.
- **Deployments** — your recent deploys, with the option to roll back or cancel a
  build (admin/owner).
- **Audit Log** — a record of who did what in the console: actions run, by whom,
  and whether they succeeded, failed, or were blocked. This is your accountability
  trail.

---

## Managing secrets (Key Vault)

The **Key Vault** (Internal tier) stores sensitive credentials encrypted. You can
add, view, and manage keys there, with every access recorded in the audit trail.
Revealing or deleting a key requires owner permission.

---

## Team access

Owners and admins manage who can use the console under **Team Access**:

- **Owner** — full control, including destructive actions.
- **Admin** — can run changes, but not owner-only actions.
- **Member** — limited, role-appropriate access.

---

## The Assistant

The built-in **Assistant** can answer questions and help you find your way around
the platform. It's grounded in your actual platform data, so it won't invent
features that don't exist.

---

## Tips

- If a button is greyed out, hover over it — it will tell you whether the action
  is coming soon or needs a higher permission level.
- Sensitive actions are intentionally gated and logged; that's protecting you and
  your data, not getting in your way.
- Switch languages from your profile/settings — the interface is available in
  English, Spanish, Portuguese, Polish, and Russian.
