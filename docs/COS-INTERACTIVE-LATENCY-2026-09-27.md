# COS / Concierge interactive latency — fix record and runbook (2026-09-27)

**Outcome:** owner COS chat and public Concierge answer in **≤ 5 seconds** (owner-verified 2026-09-27 14:46 ET), down from 43–106 s (COS) and 20–30 s (Concierge) earlier the same day. Answer quality was kept: same COS brain, same governance, same identity/company knowledge.

This document is the handoff for any future agent. Read it before touching the chat path (`app/api/cos-browser`, `app/api/cos-primary`, `lib/ai/cos/cosFirstAnswer*.ts`, `lib/ai/local-inference.ts`). The short version of the rules is in `ONBOARD.md` → *Interactive latency and one-pipeline invariant — 2026-09-27*.

---

## 1. Architecture after the fix (one pipeline)

```text
Browser (Concierge component | owner /dashboard/assistant)
  -> POST /api/cos-browser            header x-signalboost-surface: 'concierge' | 'cos'
       - direct-edit / self-contained authoring ingress -> cosPrimaryPost (no planner)
       - otherwise: first-turn PLANNER (cosAgentDecision.ts) = tool/capability request only,
         never the user's answer ("answer":"COS" no-tool JSON), maxTokens 300, thinking off
  -> cosPrimaryPost (app/api/cos-primary/route.ts)
       - semantic task intent (only when freshness/travel/context needs adjudication)
       - live web search + page reads (only when fresh evidence is really required)
       - travel lane (only for live travel planning)
       - tryCOSFirstAnswer -> cosFirstAnswer.ts -> cosFirstAnswerCore.ts -> cosFirstAnswerEnterprise.ts
            * retrieveInternalContext: 5 sources IN PARALLEL, each timed
            * semantic answer cache check
            * ONE main model call (disableThinking, CHAT_ANSWER_LENGTH_RULE)
            * release checks; public audience -> releaseToPublic()
       - post-COS rescues only if COS produced nothing (runFastAuthoring rescue, runCompletionFirstRescue)
```

Audience is decided by `cosAudience(privileged)` (`public` for Concierge delivery scope, else `owner`/`user`). The **pipeline is the same for everyone; only the reasoning context and disclosure differ.** Owner glossary (COS, University, specialist, artifact, graduate, Residency) is owner-only.

---

## 2. What was slow, how it was proven, and what changed

Every row below was proven from production data first (see §4 for the queries), then fixed, then re-measured. Nothing was changed on theory alone.

| # | Symptom (evidence) | Root cause | Fix | File(s) |
|---|---|---|---|---|
| 1 | Main COS answer call failed every time at exactly 15,001 ms, no HTTP status (`provider_inference_usage`, feature `cos_interactive_authoring`) | "Writing" questions were routed to `zai-org/GLM-5.3-Flash` on DeepInfra, which never replied inside its limit; every question then fell to a ~38 s RunPod rescue | Authoring lane uses the **configured model** (same as `cos_interactive_answer`), thinking off, 20 s limit. The `COS_INTERACTIVE_AUTHORING_MODEL` override was removed | `lib/ai/local-inference.ts` |
| 2 | Answers of 1,311–1,376 output tokens to one-line questions (~36 s at ~37 tok/s) | No length rule in the COS system prompt | `CHAT_ANSWER_LENGTH_RULE`: ~150 words by default, up to ~400 only when detail/plan/code/writing is asked. In both `COS_REASONER_SYSTEM_PROMPT` and `cosIdentityPreamble` (rescue lane) | `lib/ai/cos/cosFirstAnswerEnterprise.ts` |
| 3 | Non-English (Polish) answers: 48 s call ending `finish=length`, then a 21 s retry, both unlabeled on RunPod `qwen3:30b` | Native-language review pass had no `usageContext` → routed to the RunPod thinking model, spent its whole budget on hidden thinking, retried | Review uses `usageContext {feature:'cos_interactive_answer', purpose:'native_language_review'}` + `disableThinking:true`; then (still 8.8 s) the review was made **conditional for all five languages**: it runs only when a user-protected literal is missing (`if (alreadyPreserved) return protectedResult`) | `lib/ai/cos/cosFirstAnswer.ts` |
| 4 | Semantic-cache HIT still took 7.5–9.5 s (`cos_ai_roi_metrics` source `semantic_similarity`) | Five internal-context sources were read sequentially before the cache check | `retrieveInternalContext` runs knowledge, enterprise memory, user memory, creative memory and skills **concurrently** (`timedRetrievalStage`), systems merged in original order (output identical) | `lib/ai/cos/cosFirstAnswerEnterprise.ts` |
| 5 | `retrieval:knowledgeStage` = 9,428 ms while every other source ≤ 558 ms | Semantic lookups were already capped at 1.5 s, but the **lexical fallbacks** (wide `ilike` scan + embedding up to 128 corpus rows via `rankContextCandidates`) had no limit | `boundedContextFallback()`: KG and learned-corpus fallbacks run concurrently under `COS_CONTEXT_FALLBACK_BUDGET_MS` (default 2,500 ms). Work computes into locals and **commits only if it finishes in time**, so a late result never mutates a context already sent to the model. Rows `retrieval:kg_lexical` / `retrieval:learned_lexical[:budget_exceeded]` | `lib/ai/cos/cosFirstAnswerEnterprise.ts` |
| 6 | `primary:before_cos_first` = 38,749 ms: two gaps of exactly 18.0 s | Two **fast-authoring detours in front of COS** (`runFastAuthoring`, 18 s budget = 2 × 9 s attempts, `persistUsage:false` so invisible) ran, returned nothing, then COS answered | Both pre-COS detours removed (one-pipeline rule). `runFastAuthoring` survives **only** as the post-COS rescue | `app/api/cos-primary/route.ts` |
| 7 | Concierge travel: `primary:travel_planner` = 26,515 ms = both attempts hitting 16 s + 10 s, then the **canned itinerary backstop** was sent | Travel lane used `DeepSeek-V4-Flash` then `GLM-5.3-Flash` with 1,400/900-token caps that could not finish in time | Both travel attempts use the **configured model**; caps 900 / 600 tokens; attempts recorded (`persistUsage:true`) | `lib/ai/local-inference.ts`, `app/api/cos-primary/route.ts` |

Earlier the same day (before the measurements above), the pipeline itself was unified:

- **Stage 1 — one pipeline**: Concierge's separate public stateless answer path was removed. Public turns run the enterprise COS pipeline and then `releaseToPublic()` (scope isolation, disclosure gate, redaction).
- **Stage 2 — no answering shortcut at the entrance**: the first-turn planner in `cos-browser` no longer releases its own answer (`cos-model-direct` removed). A no-tool planner decision (`mode:'answer'`) is converted to "COS answers" and everything goes to `cosPrimaryPost`.
- **Identity**: `cosIdentityPreamble(audience)` and `companyKnowledgeBlock(prompt)` are used by the main call **and** the completion rescue, so no lane can answer "What is iTMounts?" without the company identity. SignalBoost is internal-only and never appears in answers.
- **Thinking off** for the interactive main call (`disableThinking:true`). With hidden thinking on, owner answers failed at 22–28 s against the 20 s interactive limit.

### Measured progression (owner chat, same question class)

| Time (ET) | Total | What changed |
|---|---|---|
| 01:18 | 43–106 s | baseline (thinking on, rescue answering) |
| 02:45 | ~60 s | GLM authoring lane failing + RunPod rescue |
| 03:02 | 71 s | language review on RunPod thinking model |
| 10:33 | ~30 s | language review on interactive lane |
| 11:18 | ~25 s | sequential retrieval |
| 14:06 | 54 s (Concierge) | two hidden 18 s fast-authoring detours |
| 14:23 | ~7 s (owner) | detours removed |
| 14:46 | ≤ 5 s both | travel lane fixed |

---

## 3. Rules for future changes (do not regress)

1. **One pipeline.** Nothing in `cos-browser` or `cos-primary` may answer the user in front of COS. Planners, classifiers and shortcuts may *route or request capabilities*; they never write the answer. Rescues run only *after* COS produced nothing.
2. **Every model call on the chat path carries a `usageContext`.** A call with no usage context is not an interactive call: `eligibleForRunpodPrimary()` sends it to the RunPod primary (`qwen3:30b`, thinking model, ~37 tok/s). Use `feature:'cos_interactive_answer'` (or `cos_interactive_authoring` / `cos_interactive_travel_plan`) plus a distinct `purpose`.
3. **Interactive calls run with hidden thinking off** (`disableThinking:true`) and inside the interactive timeout (`COS_INTERACTIVE_MODEL_TIMEOUT_MS`, default 20 s; authoring 20 s; travel 16 s + 10 s).
4. **Do not route chat to a model that has not been proven to answer.** `zai-org/GLM-5.3-Flash` never replied within 15 s on this account (2026-09-27). It is still the default for `direct_text_transformation` (`COS_DIRECT_TEXT_MODEL`) — see §5.
5. **Every new step on the chat path must be timed** with `recordCosLatencyStage()` / `timeCosStage()` (`lib/ai/cos/cosLatencyStages.ts`). A step that is not recorded is invisible; two invisible 18 s detours cost a whole day of guessing.
6. **Every retrieval/fallback has a budget** and must not mutate shared context after its budget expires (compute into locals, commit on time).
7. **Answer length is part of latency.** Keep `CHAT_ANSWER_LENGTH_RULE`; long answers are for explicit requests.
8. **Model calls with `persistUsage:false` are invisible in `provider_inference_usage`.** Only use it for tiny, high-frequency classifiers, and time the step anyway.
9. **Verify before you fix.** Do not state a cause without a query result that shows it. Background traffic (University exams, Builder, Self-Healing "Fix the SignalBoost platform issue…" + automatic "yes") shares these tables — filter it out (see §4).

---

## 4. How to diagnose a slow answer (owner-run SQL, Hub → Supabase → SQL Editor)

The Hub SQL Editor shows only ~5 columns — pack extra fields into one concatenated text column. The owner cannot reliably find Vercel log lines; always give one self-contained query.

### 4.1 Every step of the last question (primary tool)

```sql
-- saas/tmp/cos_last_question_stages.sql
select to_char(created_at at time zone 'America/New_York','HH24:MI:SS.MS') as et,
       'stage' as kind, source as step, latency_ms as ms, task_id as detail
from cos_ai_roi_metrics
where created_at > now() - interval '15 minutes'
union all
select to_char(created_at at time zone 'America/New_York','HH24:MI:SS.MS'),
       'ai_call', coalesce(nullif(purpose,''), feature), latency_ms,
       model || case when success then '' else ' (FAILED)' end
from provider_inference_usage
where created_at > now() - interval '15 minutes'
  and feature not like 'cos_university%' and feature not like 'mass_distilled%'
  and feature not like 'builder%' and feature <> 'coding_harness'
order by 1;
```

Stage names written by the chat path:

| Stage | Written in | Meaning |
|---|---|---|
| `concierge:planner` / `assistant:planner` | `cos-browser` | first-turn capability planner |
| `concierge:before_cos` / `assistant:before_cos` | `cos-browser` | ingress → hand-off to `cosPrimaryPost` |
| `concierge:total` / `assistant:total` | `cos-browser` | whole browser turn |
| `primary:semantic_intent` | `cos-primary` | semantic task-intent classifier |
| `primary:web_search`, `primary:web_page_reads` | `cos-primary` | live evidence |
| `primary:travel_planner` | `cos-primary` | travel lane (both attempts) |
| `primary:strategy_profile`, `primary:conversation_recall` | `cos-primary` | optional context |
| `primary:before_cos_first` | `cos-primary` | cos-primary start → COS start (**should be a few seconds**) |
| `primary:cos_first_answer` | `cos-primary` | whole COS pipeline |
| `primary:completion_rescue`, `primary:legacy_concierge` | `cos-primary` | post-COS fallbacks (should be rare) |
| `retrieval:<source>Stage` | enterprise | each of the 5 context sources |
| `retrieval:kg_lexical`, `retrieval:learned_lexical[:budget_exceeded]` | enterprise | bounded lexical fallbacks |
| `semantic_similarity` / `exact_cache` / `local_reasoner` (task `cos-first-answer`) | enterprise | how COS answered + its internal time |

Note: the direct-edit and self-contained-authoring ingress paths in `cos-browser` return before the planner, so those turns have no `*:planner` / `*:before_cos` rows.

### 4.2 Why a model call failed

```sql
-- saas/tmp/cos_call_detail.sql
select to_char(created_at at time zone 'America/New_York','HH24:MI:SS') as et, feature, success,
       concat_ws(' | ', 'model=' || model, 'ms=' || latency_ms, 'http=' || coalesce(http_status::text,'none'),
                 'finish=' || coalesce(finish_reason,'none'), 'out=' || coalesce(completion_tokens::text,'none'),
                 'in=' || coalesce(prompt_tokens::text,'none')) as detail, purpose
from provider_inference_usage
where created_at > now() - interval '20 minutes'
  and (feature like 'cos_%' or feature = 'unattributed_local_inference')
  and feature not like 'cos_university%'
order by created_at;
```

Reading it: `ms` ≈ a round limit with `http=none` → timeout (model never answered). `finish=length` → output cap hit. `unattributed_local_inference` on `qwen3:30b` → a chat call missing its `usageContext` (rule 2).

### 4.3 Why COS rejected its own answer

`cos_learning_gaps` (`escalation_reason`, `last_seen_at`). "Independent COS inference did not return an answer." means the main call returned nothing.

### 4.4 How an answer was produced

`assistant_messages.provenance`: `answer_origin.from_cache`, `semantic_cache.used`, `local_reasoning.model/confidence`, `live_external_evidence.used`, `policy` (e.g. `travel_plan_evidence_backstop` = canned itinerary, i.e. the travel model failed).

---

## 5. Known open items (not done)

- `direct_text_transformation` still defaults to `zai-org/GLM-5.3-Flash` (`COS_DIRECT_TEXT_MODEL`). Same model that never answered for authoring. Verify with §4.2 on a real edit request before trusting it.
- `simpleKnowledgeFastPath`, `cosAgentDecision` (planner) and `publicConciergeIdentityIntent` use `persistUsage:false`; the planner is timed (`*:planner`), the others are not.
- Stage 3 of the one-pipeline plan: move the older `/api/support` route onto the same `/api/cos-browser` → COS entrance.
- Ungated test files already failing on main (not caused by this work): `tests/conciergeNativeLanguageQuality.node.test.ts` (4), `tests/conciergeNativeReleaseGuard.node.test.ts` (1), `tests/cosFastWritingCanonical.node.test.ts` (1).
- Builder job failure seen 12:35 ET: "builder coding AI provider returned no text" (RunPod `qwen3:30b`, 25 s, no output).
