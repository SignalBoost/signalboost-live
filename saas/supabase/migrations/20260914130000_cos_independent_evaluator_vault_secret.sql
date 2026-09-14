-- Provision a separately generated independent-evaluator signing key in Supabase Vault.
-- The model runtime, learner, browser, anon and authenticated roles never receive this secret.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'cos_university_independent_evaluator_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(48), 'hex'),
      'cos_university_independent_evaluator_secret',
      'iTMounts COS University independent evaluator HMAC signing key',
      NULL
    );
  END IF;
END
$$;

create or replace function public.cos_read_independent_evaluator_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'cos_university_independent_evaluator_secret'
  order by created_at desc
  limit 1
$$;

revoke all on function public.cos_read_independent_evaluator_secret() from public, anon, authenticated;
grant execute on function public.cos_read_independent_evaluator_secret() to service_role;

comment on function public.cos_read_independent_evaluator_secret() is
  'Service-role-only accessor for the independent evaluator HMAC key stored in Supabase Vault.';
