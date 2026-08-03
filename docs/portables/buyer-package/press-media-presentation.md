<!-- docs/portables/buyer-package/press-media-presentation.md -->

# Press & Media — Buyer Evaluation

**Release:** `1.0.0-rc.1` design-partner evaluation
**Package:** `@portable/press-media`

> **Before sending this document, fill in:** [SET price], [SET pilot length], [SET pilot fee],
> and the contact line at the end.

---

## 1. The problem

Press outreach fails in a way that other marketing automation does not: **it fails publicly and it does not roll back.**

A campaign that sends the wrong offer costs a click. A press release that invents a product name, misattributes a quote, or states a statistic nobody approved goes out under your name to a named editor at a real publication. The editor keeps it. Correcting it costs more attention than the original pitch would ever have earned.

That is why generative tools have not displaced the PR agency. The output is fluent, the risk is unbounded, and nobody in communications will sign off on a system that is confident about facts it has no way to check.

## 2. What it is

Press outreach as **injectable behaviour** that runs inside your environment: a provider registry, five adapter shapes, a discovery layer, a factual-discipline kernel that constrains what generated copy is permitted to assert — and a **working transport, so it sends**.

**Two paths send today with credentials alone.** Free editorial submission goes out through your own mail transport. Business Wire goes out through a shipped integration built against their published API: you enter your Connect login, your source key, and pick your account and circuit from your own account. No code.

You supply the model, the mail transport, the notification path, the provider accounts, and the record of who your company actually is. The portable supplies the behaviour, the discipline, and the sending.

It holds no credential of ours, runs on no infrastructure of ours, and calls nothing of ours. The graph walk that builds each release reports **zero** host imports on the buyer surface — verified by the packager, which refuses to produce an archive if the boundary leaks.

## 3. The rule the design turns on

> **No approved fact, no claim. No approved quote, no quote.**

Three enforcements, applied regardless of what the model produces:

1. **Only declared company facts may be stated.** The engine never assumes who it works for — it asks your host for the company profile.
2. **Forbidden claims are matched exactly.** Deterministic string matching against the list you declare, not a judgement about tone that varies between runs.
3. **A quote attributed to a person requires an approved quote.** Absent one, no quote is emitted at all.

And proof is never fabricated: until the provider confirms publication, the record stays pending and returns no URL.

This is not a filter bolted onto a generator. It is the reason the generator is safe to point at an editor.

## 4. Finding publications

Most tools in this category assume you already have a media list. Two of the five adapters make that assumption explicit — free submission requires an editor address to be supplied, and a media database *verifies* a contact it is handed rather than searching for one.

So discovery is its own port, and it is deliberately not a built-in. There is no single right source: you may have a Cision or Muck Rack subscription, a web-search key, or a curated in-house list. You supply whichever you have; the engine never knows which.

Two properties worth noting for a communications team:

- **Editorial by default.** Editor, newsroom, press and submissions desks. Advertising, sponsorship and sales addresses are excluded unless you ask for paid placement explicitly.
- **A lead is not a target.** Discovery contacts nobody and queues nothing. Converting a lead into something the engine will actually email is a separate, deliberate step — and a person takes it.

Regional coverage is native-language rather than translated: Brazilian *jornal* and *revista*, Mexican *periódico*, Polish *gazeta*, Russian *газета* are recognised as publications with their own editorial address conventions, not filtered out because they do not look English.

## 5. What actually sends, and what does not

Stated as a table rather than a claim, because this is the question that decides whether you can use it next week.

| | Status |
| --- | --- |
| **Free editorial submission** | **Works.** Goes out through your own mail transport. |
| **Business Wire** | **Works on credentials alone.** Shipped integration against their published API. |
| Other wires — PR Newswire, GlobeNewswire, PRWeb | You fill in a form: endpoint, auth style, field names. No code. |
| EIN Presswire | **No developer API exists.** Named as delegated, so you know at setup rather than at send time. Submit through their portal, or point us at an endpoint you run. |
| Media databases — Cision, Muck Rack, Meltwater, Prowly | Verification only, and only if your contract includes API access. None of them publishes an open API. |

**Two fields are picked from your own account, never typed:** which account the release is billed to, and which circuit it goes out on. A typed account posts under the wrong entity; a typed circuit buys the wrong reach at the wrong price. Neither mistake is visible until after the release is out, so we read both live and let a person choose.

**One honest asymmetry.** The wire side sends. The database side only *verifies* a contact you already have — and verification is a safeguard on top of sending, never a precondition for it. If you have your own checked list, you are ready today.

If your PR licence sits with your agency rather than with you — common at this size — that is expected, and it is why free submission is a first-class path rather than a fallback.

## 6. What you implement

| Boundary | What you supply |
| --- | --- |
| Wire transport | **nothing for Business Wire** — credentials only. A form for other wires. |
| AI | your model and your key |
| Email | your transport |
| Notification | how your owner is told, at submission and again at publication |
| Company profile | the facts the AI is permitted to state |
| Provider execution | your registry and secret resolution for paid providers |
| Audit sink | your SIEM, for SOC 2 / ISO 27001 evidence |
| Discovery | your media source, if you have one |

Omitted optional ports are reported honestly and never simulated. Discovery without a source refuses with a message naming what to connect, rather than returning an empty list that reads like "no publications exist."

## 7. The portability claim, verified rather than asserted

Each release is built by walking the real import graph from the declared entry points — not from a hand-written file list — and **the build fails if the graph reaches anything undeclared.** Host fallbacks and vendor-name exceptions are both empty, and verified empty by that walk.

Every archive carries `SHA256SUMS`, a CycloneDX 1.5 SBOM, and release notes.

## 8. Acceptance runs in your environment, against your ports

Eleven independently reported checks: provider registered, buyer identity used, unverified target refused, invalid contact refused, generation used your AI, forbidden claim absent, unapproved quote absent, dispatch delivered, owner notified, proof not fabricated, audit sink reachable.

Two design choices your security reviewer will ask about:

- It sends **one real email**, to an address **you** supply and control, and refuses to run without one. It never reads a target from a media database. The send is real because a stubbed transport proves nothing about whether your mail actually leaves.
- Delivery is recorded only **after** your transport confirms it. Recording first produces a green result for mail that never left — a failure this codebase has seen, fixed, and pinned with a test.

The result is a signed, JSON-serialisable record. Keep it: it is your acceptance evidence.

## 9. What it does not do

- It does not include any press, wire, media-database or advertising **account**. The Business Wire transport is shipped; the contract and the invoice are yours.
- It does not send through wires that publish no API. EIN Presswire is named rather than pretended.
- It does not include an AI provider, a mail transport, or a datastore.
- It does not guarantee coverage. No system can. It puts an accurate, factually constrained pitch in front of the right desk.
- It does not decide who to contact. It proposes; a person approves.
- It does not write your company's facts. You declare them.

## 10. Editions and commercials

| | Evaluation | Production |
| --- | --- | --- |
| Adapters | all five | all five |
| Discovery port | included | included |
| Acceptance harness | included | included |
| Audit sink | included | included |
| Price | [SET price] | [SET price] |

**Pilot:** [SET pilot length] at [SET pilot fee], covering installation into one environment, one acceptance run against your own ports, and one live campaign to a desk you choose.

Source delivery makes licence enforcement contractual rather than technical. We state that plainly rather than implying a protection that does not exist.

## 11. Next steps

1. A technical session against the integration guide — roughly an hour with whoever owns your mail transport and your model access.
2. Installation into one non-production environment.
3. An acceptance run against your ports, to your own address. Eleven checks, one record.
4. One live campaign to a desk you choose.

Contact: [SET name, title, email]
