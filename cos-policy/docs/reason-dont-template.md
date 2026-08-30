<!-- path: /home/workdir/artifacts/cos-policy/docs/reason-dont-template.md -->
<!-- repo: cos-policy/docs/reason-dont-template.md -->

# Reason. Do not precode every question.

Topic schemas (pay-gap gold paragraph, sports gold paragraph, …) are machine-learning-era lookup. They do not scale and they teach the wrong behavior: wait for a template.

COS has to run one procedure on every contested claim, the way a network generalizes: same weights, new input.

## What went wrong

The live pay-gap answer was not “missing a pay-gap template.” It was **retrieval-shaped writing**:

1. Search the question string.
2. Read Equal Pay Day pages.
3. Emit their headline order.
4. Park the interesting distinction in a follow-up chip.

A deep model can already split “raw average” from “equal work.” It did not, because the product rewarded snippet concatenation more than inference.

If you add a canned first paragraph for pay, you will need another for race gaps, another for sport, another for pregnancy. That is a FAQ bot.

## What to load instead

Load `prompts/constraint-first-reasoner.txt` into the generator.

That file has **no correct answers**. It has a loop:

1. Parse and split overloaded words.
2. Name the constraint (biology, statute, like-for-like comparison).
3. Say what the evidence is actually of — and what it is not.
4. Write constraint → measurement → limit → advocacy.
5. On challenge, re-run the loop; do not fetch a new junk pile.

Worked examples may exist in the long policy doc for humans. They must not be the inference path.

## Product constraint that blocks “neural” behavior

If the generator is hard-tied to “only sentences that appear in LIVE snippets, in hit order,” you have disabled reasoning. The model can only remix headlines.

Fix that rule to:

- Numbers and quotations must come from sources.
- **Structure, splits, and “what this number is not” come from reasoning.**
- Missing like-for-like evidence → say missing. Do not promote a nearby essay.

That is the difference between a search summarizer and a model.

## How you know it generalized

Do not test only `does pay gap exist in the US?`

Ask new questions the templates never saw, for example:

- Do Black and White Americans with the same job and experience earn the same?
- If two people have the same title, is the raw gender gap the right number?
- Can a category called “women’s” stay coherent if eligibility is identity?
- Is “men get pregnant” a statement about males or about some females?

Pass = it splits the claim, names the constraint, and marks what the study did not measure. Fail = it opens with the first article’s yes/no.
