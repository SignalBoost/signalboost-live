-- saas/supabase/migrations/20261012060000_lab_teacher_rate_cards_seed.sql
-- Customer LAB: first verified teacher prices, so the matching teacher models become selectable.
--   * Every price below was read on 2026-10-12 from the provider's own official pricing page (source_url on each row).
--     Only models whose exact API model id AND price appear on an official page are listed. Anything else stays
--     unpriced (shown disabled), never guessed.
--   * LAB teacher prompts are capped at 4,000 characters, so the lowest context tier applies where a provider prices
--     by prompt length (Claude Haiku 5.5 <= 100k tokens, Gemini Pro <= 200k tokens).
--   * DeepSeek charges half price off-peak. The PEAK price is stored: reservations and settlement can only overstate,
--     never understate, the customer's spend.
--   * Gemini 3.6 / 3.8 Flash change price on 2027-01-01: one row until then, one from then on.
--   * Fix: the priced-model list now honours rows with an end date (it previously only saw open-ended rows), using the
--     same rule as lab.active_teacher_rate_card.
-- Idempotent: a row is added only when no row for that provider + model already covers its start date.

create or replace function public.itmounts_lab_customer_priced_teacher_models(p_organization_id uuid, p_provider_kind text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(distinct model order by model) from lab.teacher_rate_cards
    where provider_kind = p_provider_kind and effective_from <= now()
      and (effective_until is null or effective_until > now())), '[]'::jsonb);
end $$;
revoke all on function public.itmounts_lab_customer_priced_teacher_models(uuid, text) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_priced_teacher_models(uuid, text) to authenticated;

insert into lab.teacher_rate_cards
  (provider_kind, model, input_usd_per_mtok, output_usd_per_mtok, source_url, verified_by, verified_at, effective_from, effective_until)
select v.provider_kind, v.model, v.input_usd, v.output_usd, v.source_url,
       'Claude Code session 2026-10-12, official pricing page; applied by owner', '2026-10-12T20:00:00Z'::timestamptz,
       v.effective_from::timestamptz, v.effective_until::timestamptz
from (values
  -- Anthropic: https://platform.claude.com/docs/en/about-claude/pricing (ids: .../about-claude/models/overview)
  ('anthropic', 'claude-fable-5-1',   10.00,  50.00, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-10-12T00:00:00Z', null),
  ('anthropic', 'claude-opus-5-5',     4.00,  20.00, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-10-12T00:00:00Z', null),
  ('anthropic', 'claude-sonnet-5-5',   2.00,  10.00, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-10-12T00:00:00Z', null),
  ('anthropic', 'claude-haiku-5-5',    0.10,   0.50, 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-10-12T00:00:00Z', null),
  -- Google Gemini (paid tier, text): https://ai.google.dev/gemini-api/docs/pricing
  ('gemini', 'gemini-3.1-pro-preview', 2.00,  12.00, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', null),
  ('gemini', 'gemini-3-flash-preview', 0.50,   3.00, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', null),
  ('gemini', 'gemini-3.1-flash-lite',  0.25,   1.50, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', null),
  ('gemini', 'gemini-3.5-flash-lite',  0.30,   2.50, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', null),
  ('gemini', 'gemini-3.6-flash',       0.75,   3.75, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('gemini', 'gemini-3.6-flash',       1.50,   7.50, 'https://ai.google.dev/gemini-api/docs/pricing', '2027-01-01T00:00:00Z', null),
  ('gemini', 'gemini-3.8-flash',       0.75,   3.75, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('gemini', 'gemini-3.8-flash',       1.50,   7.50, 'https://ai.google.dev/gemini-api/docs/pricing', '2027-01-01T00:00:00Z', null),
  ('gemini', 'gemini-2.5-pro',         1.25,  10.00, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-10-12T00:00:00Z', null),
  -- Groq: https://console.groq.com/docs/models
  ('groq', 'openai/gpt-oss-120b',      0.15,   0.60, 'https://console.groq.com/docs/models', '2026-10-12T00:00:00Z', null),
  ('groq', 'openai/gpt-oss-20b',       0.075,  0.30, 'https://console.groq.com/docs/models', '2026-10-12T00:00:00Z', null),
  -- xAI: https://docs.x.ai/docs/models
  ('xai', 'grok-4.7',                  2.00,   6.00, 'https://docs.x.ai/docs/models', '2026-10-12T00:00:00Z', null),
  -- DeepSeek (peak price, see header): https://api-docs.deepseek.com/quick_start/pricing
  ('deepseek', 'deepseek-flash',       0.30,   1.20, 'https://api-docs.deepseek.com/quick_start/pricing', '2026-10-12T00:00:00Z', null),
  ('deepseek', 'deepseek-v4-pro',      1.32,   3.96, 'https://api-docs.deepseek.com/quick_start/pricing', '2026-10-12T00:00:00Z', null)
) as v(provider_kind, model, input_usd, output_usd, source_url, effective_from, effective_until)
where not exists (
  select 1 from lab.teacher_rate_cards t
   where t.provider_kind = v.provider_kind and t.model = v.model
     and (t.effective_until is null or t.effective_until > v.effective_from::timestamptz)
     and (v.effective_until is null or t.effective_from < v.effective_until::timestamptz)
);
