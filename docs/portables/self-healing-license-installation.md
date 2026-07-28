<!-- docs/portables/self-healing-license-installation.md -->

# Self-Healing Supervisor — installing your licence

You received a licence token when your order was processed. This page is where it goes,
what it turns on, and how to confirm it worked.

Read [self-healing-integration-guide.md](./self-healing-integration-guide.md) first if the
portable is not yet deployed. This page assumes it is running and that you can set
environment variables in whatever runs it.

---

## What the licence controls

Two capabilities require a licence:

| Feature | What it is |
|---|---|
| `repair.plan` | Generating a repair plan from an incident, with verification steps |
| `repair.dispatch` | Executing approved repair steps |

Three capabilities are **never** gated, in any edition, including with no licence
installed at all:

| Feature | Why it is never gated |
|---|---|
| `incident.observe` | Reading incident history, the dispatch ledger and audit records. You must be able to see what happened in your own infrastructure regardless of any billing question. |
| `siem.export` | Emitting audit events to your SIEM. Your security team does not lose visibility over a commercial dispute. |
| `approval.gating` | Routing consequential steps to a named approver. This is the product's safety property, not a paid add-on. |

There is no edition in which a consequential step runs without a named human approving it.

### Editions

| Edition | Features |
|---|---|
| `standard` | `repair.plan`, `repair.dispatch`, `repair.api-steps` |
| `enterprise` | the above plus `repair.browser-steps` |

`repair.api-steps` covers repair steps that call an API through your own `ApiStepRunner`.
`repair.browser-steps` covers steps driven through a browser runtime, and is separable
because it needs a Chromium runtime you or a provider operates.

---

## Fail-closed behaviour — read this before you deploy

**With no licence installed, planning and dispatch refuse.** This is deliberate. A licence
check that silently passes when misconfigured is not a licence check.

The consequence is specific and worth stating plainly: an unlicensed deployment still
**receives and records** every alert sent to the intake endpoint. It does not diagnose
them. Nothing is lost, and nothing is silently degraded into looking like it worked.

A refusal surfaces as an error named `EntitlementError` whose message names the action and
the reason, for example:

```
repair.plan requires a licence — not set: SUPERVISOR_LICENSE_TOKEN
```

---

## The three environment variables

Set these wherever your deployment reads configuration — your platform's environment
settings, your secrets manager, or your orchestrator's secret objects. They are secrets in
the ordinary sense: the token identifies your entitlement and should not be committed to a
repository.

| Variable | Value |
|---|---|
| `SUPERVISOR_LICENSE_TOKEN` | The token string issued to you. Paste it whole. |
| `SUPERVISOR_LICENSE_ISSUER` | The issuer name, supplied with your token. It must match exactly. |
| `SUPERVISOR_LICENSE_PUBLIC_KEYS` | The issuer's public key in PEM form, supplied with your token. |

### Notes that will save you a support ticket

**The public key must be real PEM.** A value is only accepted if it contains the literal
text `BEGIN PUBLIC KEY`. Anything else is dropped silently, and the deployment reports the
variable as not set.

**Newlines in the key.** Environment variables handle real newlines badly. You may write
the key with literal `\n` sequences instead of real line breaks, and they are converted
back before use. Both forms work.

**More than one key.** Separate several PEM blocks with a comma or with `||`. This exists
so a key can be rotated without a window in which every deployment refuses: install the new
key alongside the old one, wait for the new token, then remove the old key.

**`SUPERVISOR_LICENSE_PUBLIC_KEY`** (singular) is accepted as a fallback if the plural form
is unset. Prefer the plural.

**Configuration is read once and cached.** Changing any of these values requires a restart
or a new deployment. Editing the variable alone will not take effect on a running instance.

---

## Confirming it worked

1. **Restart or redeploy** after setting the variables. This is the step people miss.
2. **Send a test alert** to the intake endpoint, following the verification procedure in
   [self-healing-monitoring-connections.md](./self-healing-monitoring-connections.md).
3. **Confirm the incident is diagnosed, not merely recorded.** An unlicensed deployment
   accepts the alert and stops. A licensed one produces a repair plan.
4. **Confirm the approval gate still fires.** A consequential step must pause for a named
   approver. If it does not, stop and raise it — that is the safety property, not a
   configuration preference.

### If it refuses

The reason string names the missing piece rather than saying "licensing is not configured",
so read it literally.

| Reason | Meaning |
|---|---|
| `not set: SUPERVISOR_LICENSE_TOKEN` | The token variable is empty or whitespace |
| `not set: SUPERVISOR_LICENSE_ISSUER` | The issuer variable is empty or whitespace |
| `not set: SUPERVISOR_LICENSE_PUBLIC_KEYS (PEM)` | No supplied value contained `BEGIN PUBLIC KEY` |
| Anything else | The key material parsed but was rejected. A malformed key produces this rather than throwing during an incident. |

An issuer mismatch, an expired token, or a token signed by a different key all refuse. A
licence issued for a different product does not unlock this one.

---

## What the licence does not enforce

Seat counts and execution limits are **recorded in the token but not enforced by the
product**. They are contract terms, and they are governed by your agreement rather than by
a technical control. This is stated here so nobody plans around a limit that does not
exist.

---

<!-- VENDOR SECTION — remove this section before handing this document to a buyer. -->

## Vendor: issuing a licence

Run from `saas/`.

Generate an issuer key pair once. The private key goes in a vault; it is not recoverable,
and it is the only thing standing between anyone and a licence that verifies.

```
node --experimental-strip-types scripts/issue-license.ts --genkey
```

Issue a token for one buyer:

```
node --experimental-strip-types scripts/issue-license.ts \
  --key-file /secure/issuer.key \
  --issuer <issuer-name> \
  --product self-healing-supervisor \
  --licensee "Buyer GmbH" \
  --edition enterprise \
  --seats 25 --days 365 --grace 14
```

Defaults: edition `standard`, 365 days, 14 grace days. `--perpetual` issues a token with no
expiry. The private key is read from a file you point at — never from this repository and
never from an environment variable, so it stays out of shell history, process listings and
CI logs.

Features come from the edition unless `--features` overrides them, and either way they are
checked against the catalogue before anything is signed. `--no-catalog-check` skips that
and prints a warning; a feature name no code checks produces a licence that silently
unlocks nothing, which surfaces as a refusal during the buyer's first real incident.

**Record the licence id.** Revocation is by id, and you cannot revoke what you did not
write down.

The vendor's own deployment needs the same three variables set, from a token minted the
same way. This is not a formality: it is the only path by which the buyer's experience is
ever exercised before a buyer has it.
