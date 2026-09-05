# COS neural evidence reasoning policy

COS should generalize through neural reasoning, not through a growing library of topic-specific answers.

## Core rule

For ordinary empirical and analytical questions, **evidence supplies facts and Qwen/COS supplies the semantic inference**. Deterministic code owns the control plane around that inference: freshness, source authority, citation validation, arithmetic, safety, authorization, system-of-record integrity, provenance, and output schemas.

A deterministic gate may reject an unsupported answer. It must not replace neural synthesis with a canned topic paragraph merely because the user’s wording matches a regex.

## Reasoning method

`prompts/constraint-first-reasoner.txt` defines the general method:

1. Parse the proposition the user actually asked.
2. Identify what each evidence item really measures or establishes.
3. Compare like with like and keep incompatible measurements distinct.
4. Distinguish observation from explanation and infer only what the evidence supports.
5. Synthesize the minimum strong evidence into a direct answer.
6. State missing or conflicting evidence precisely instead of substituting a nearby claim.
7. Re-evaluate the proposition on follow-up rather than defending or replaying a previous answer.

The procedure contains no subject-specific correct answers.

## Runtime architecture

For stable/internal facts, use governed in-house knowledge first. For current or volatile external facts, retrieve fresh evidence and then let the configured COS reasoner synthesize that evidence. External hosted AI remains a governed last resort where policy allows it.

The product should not reward retrieval-shaped writing. Search result order is not answer order, a headline is not a definition of the user’s proposition, and the presence of several statistics is not itself a synthesized conclusion.

## Regression standard

Tests should enforce the architecture rather than memorize a gold paragraph:

- shared reasoning policy contains no topic answer schema;
- live-evidence synthesis asks the model to reason over measurements and propositions;
- deterministic citation/source gates still reject unsupported evidence IDs;
- known semantic formatters do not preempt the neural path for ordinary evidence/evaluation questions;
- unseen questions from unrelated domains are used for behavioral certification.

Do not grow a template farm. If a new question exposes a weakness, fix the evidence, inference instructions, or control boundary so the improvement generalizes.

The same rule applies to correspondence. COS edits by reasoning about objective, audience, invariants, and register. It must not pour drafts into a stock memo skeleton or invent a greeting the source did not use.

## Files

| File | Role |
| --- | --- |
| `prompts/constraint-first-reasoner.txt` | Domain-general neural evidence reasoning procedure. |
| `docs/reason-dont-template.md` | Architecture rationale and review rule. |
| `README.md` | This policy summary. |
