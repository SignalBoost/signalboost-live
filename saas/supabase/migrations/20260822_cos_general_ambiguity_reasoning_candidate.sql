-- Seed one generalized procedural reasoning candidate without pretending it is already learned.
--
-- The live selector only injects validated/learned/mastered skills. This row therefore records the
-- reusable procedure and its structural trigger kinds now, while COS's existing evaluator,
-- practice, holdout, retention, and production lifecycle decides whether it may later enter live
-- answers. A single conversation or user correction is never enough to promote a reasoning rule.

insert into public.cos_cognitive_skills (
  skill_key,
  subject,
  title,
  description,
  procedure,
  status,
  evaluator_approved,
  understanding_approved,
  encounter_count,
  provenance,
  metadata
) values (
  'reasoning.context_ambiguity_resolution.v1',
  'ambiguity and context resolution',
  'Resolve material ambiguity before answering',
  'Resolve referents, deictic context, missing comparison baselines, vague temporal references, and materially different interpretations before committing to an answer.',
  jsonb_build_object(
    'problemClass', 'ambiguity and context resolution',
    'reasoningTriggers', jsonb_build_array(
      'deictic_predicate_question',
      'unresolved_referent_followup',
      'underspecified_comparison',
      'vague_temporal_reference'
    ),
    'procedureSteps', jsonb_build_array(
      'Identify the exact term, referent, scope, baseline, or time window that could support more than one materially different interpretation.',
      'Use conversation context and supplied evidence to resolve that ambiguity when one interpretation is strongly supported.',
      'Do not manufacture location, identity, comparison baseline, timing, user preference, or environmental state that was not supplied or reliably retrieved.',
      'If one interpretation remains materially most likely, answer it and state only the assumption the user needs to understand the result.',
      'If multiple interpretations remain and would change the answer, ask one concise clarification or provide conditional branches when that is more useful than blocking.',
      'Re-check the final answer against the original question and constraints before returning it.'
    ),
    'discriminatingSignals', jsonb_build_array(
      'deictic words such as here, there, this, or that whose referent matters',
      'pronoun-only follow-ups whose identity depends on prior conversation context',
      'comparatives without an explicit baseline',
      'relative time phrases whose concrete window matters'
    ),
    'commonFailureModes', jsonb_build_array(
      'guessing what here or this refers to',
      'answering one interpretation while silently ignoring another material interpretation',
      'asking a clarification even when supplied context already resolves the question',
      'turning a subjective term into an objective fact without defining the standard'
    ),
    'prohibitedActions', jsonb_build_array(
      'invent missing context',
      'treat a user correction as verified universal truth',
      'expose hidden chain-of-thought'
    )
  ),
  'encountered',
  false,
  false,
  1,
  jsonb_build_object(
    'origin', 'governed_reasoning_candidate',
    'source_ref', 'signalboost://reasoning/context-ambiguity/v1',
    'source_semantics', 'curated procedural candidate requiring independent validation before live reuse'
  ),
  jsonb_build_object(
    'activation_rule', 'never inject until status is validated, learned, or mastered',
    'confidence_rule', 'procedural skill selection must not increase factual answer confidence',
    'reasoningTriggers', jsonb_build_array(
      'deictic_predicate_question',
      'unresolved_referent_followup',
      'underspecified_comparison',
      'vague_temporal_reference'
    )
  )
)
on conflict (skill_key) do nothing;

insert into public.cos_cognitive_experiences (
  experience_hash,
  subject,
  experience_kind,
  skill_key,
  source_kind,
  source_ref,
  success,
  score,
  evidence
) values (
  'governed-reasoning-candidate:context-ambiguity:v1',
  'ambiguity and context resolution',
  'reflection',
  'reasoning.context_ambiguity_resolution.v1',
  'governed_design',
  'signalboost://reasoning/context-ambiguity/v1',
  null,
  null,
  jsonb_build_object(
    'semantics', 'candidate_procedure_not_validated_skill',
    'automaticSkillPromotionAllowed', false,
    'requiresEvaluatorApproval', true,
    'requiresUnderstandingApproval', true,
    'requiresIndependentHoldouts', true
  )
)
on conflict (experience_hash) do nothing;
