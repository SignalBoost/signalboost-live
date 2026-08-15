-- COS Council challenge/rebuttal and verified-outcome learning.
-- Council discourse remains advisory. Credibility changes only through this migration's
-- externally verified outcome function, which is restricted to the service role.

alter table public.cos_council_sessions
  add column if not exists challenge_count integer not null default 0 check (challenge_count >= 0),
  add column if not exists challenge_round_completed_at timestamptz,
  add column if not exists verification_source_class text,
  add column if not exists verification_source_ref text,
  add column if not exists verification_findings jsonb not null default '[]'::jsonb;

create table if not exists public.cos_council_challenges (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cos_council_sessions(id) on delete cascade,
  challenger_role text not null check (challenger_role in ('architect','sre','database','security','business','skeptic')),
  target_role text not null check (target_role in ('architect','sre','database','security','business','skeptic')),
  target_claim_index integer not null check (target_claim_index >= 0),
  challenge_text text not null,
  evidence_labels jsonb not null default '[]'::jsonb,
  alternative_explanation text,
  requested_observable text,
  falsifier text,
  reasoner_label text,
  created_at timestamptz not null default now()
);

create index if not exists cos_council_challenges_session_idx
  on public.cos_council_challenges(session_id, created_at asc);

create table if not exists public.cos_council_rebuttals (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.cos_council_challenges(id) on delete cascade,
  session_id uuid not null references public.cos_council_sessions(id) on delete cascade,
  role text not null check (role in ('architect','sre','database','security','business','skeptic')),
  response_text text not null,
  disposition text not null check (disposition in ('defend','revise','concede')),
  revised_claim text,
  verification_request text,
  reasoner_label text,
  created_at timestamptz not null default now()
);

create index if not exists cos_council_rebuttals_session_idx
  on public.cos_council_rebuttals(session_id, created_at asc);

create table if not exists public.cos_council_verifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.cos_council_sessions(id) on delete cascade,
  source_class text not null check (source_class in ('deterministic_tool','human_review','production_outcome','authoritative_record')),
  source_ref text not null,
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  verdicts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_council_verifications_created_idx
  on public.cos_council_verifications(created_at desc);

alter table public.cos_council_challenges enable row level security;
alter table public.cos_council_rebuttals enable row level security;
alter table public.cos_council_verifications enable row level security;

comment on table public.cos_council_challenges is
  'Bounded post-independence challenges. Advisory reasoning artifacts only; never factual evidence.';
comment on table public.cos_council_rebuttals is
  'Target-member defend/revise/concede responses to bounded Council challenges. Advisory only.';
comment on table public.cos_council_verifications is
  'Auditable non-Council evidence that resolves a deliberated case and is the sole input to specialist credibility updates.';

create or replace function public.cos_record_council_verified_outcome(
  p_session_id uuid,
  p_source_class text,
  p_source_ref text,
  p_summary text,
  p_findings jsonb default '[]'::jsonb,
  p_verdicts jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem_class text;
  v_status text;
  v_item jsonb;
  v_role text;
  v_verdict text;
  v_verified integer := 0;
  v_supported integer := 0;
  v_refuted integer := 0;
  v_seen text[] := array[]::text[];
begin
  if p_source_class not in ('deterministic_tool','human_review','production_outcome','authoritative_record') then
    raise exception 'unsupported Council verification source class: %', p_source_class using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_source_ref, '')), '') is null then
    raise exception 'Council verification source_ref is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_summary, '')), '') is null then
    raise exception 'Council verification summary is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_verdicts, '[]'::jsonb)) <> 'array' then
    raise exception 'Council verification verdicts must be a JSON array' using errcode = '22023';
  end if;

  select problem_class, status
    into v_problem_class, v_status
    from public.cos_council_sessions
   where id = p_session_id
   for update;

  if not found then
    raise exception 'Council session % not found', p_session_id using errcode = 'P0002';
  end if;

  if v_status = 'verified' then
    return jsonb_build_object(
      'ok', true,
      'already_verified', true,
      'verified_roles', 0,
      'supported_roles', 0,
      'refuted_roles', 0
    );
  end if;
  if v_status <> 'deliberated' then
    raise exception 'Council session % must be deliberated before verification; status=%', p_session_id, v_status using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_verdicts, '[]'::jsonb)) loop
    v_role := nullif(btrim(coalesce(v_item->>'role', '')), '');
    v_verdict := nullif(btrim(coalesce(v_item->>'verdict', '')), '');

    if v_role not in ('architect','sre','database','security','business','skeptic') then
      raise exception 'unsupported Council role in verdict: %', coalesce(v_role, '<missing>') using errcode = '22023';
    end if;
    if v_verdict not in ('supported','refuted','not_scored') then
      raise exception 'unsupported Council verdict for %: %', v_role, coalesce(v_verdict, '<missing>') using errcode = '22023';
    end if;
    if v_role = any(v_seen) then
      raise exception 'duplicate Council verdict for role %', v_role using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_role);

    if not exists (
      select 1 from public.cos_council_opinions
       where session_id = p_session_id and role = v_role
    ) then
      raise exception 'role % did not produce an opinion in Council session %', v_role, p_session_id using errcode = '22023';
    end if;

    if v_verdict = 'not_scored' then
      continue;
    end if;

    v_verified := v_verified + 1;
    if v_verdict = 'supported' then
      v_supported := v_supported + 1;
    else
      v_refuted := v_refuted + 1;
    end if;

    insert into public.cos_council_member_credibility (
      role,
      problem_class,
      verified_cases,
      correct_cases,
      last_verified_at,
      metadata,
      updated_at
    ) values (
      v_role,
      v_problem_class,
      1,
      case when v_verdict = 'supported' then 1 else 0 end,
      now(),
      jsonb_build_object(
        'last_source_class', p_source_class,
        'last_source_ref', left(p_source_ref, 1000),
        'last_verdict', v_verdict
      ),
      now()
    )
    on conflict (role, problem_class) do update set
      verified_cases = public.cos_council_member_credibility.verified_cases + 1,
      correct_cases = public.cos_council_member_credibility.correct_cases + excluded.correct_cases,
      last_verified_at = excluded.last_verified_at,
      metadata = coalesce(public.cos_council_member_credibility.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = now();
  end loop;

  if v_verified = 0 then
    raise exception 'at least one Council role must be externally scored as supported or refuted' using errcode = '22023';
  end if;

  insert into public.cos_council_verifications (
    session_id,
    source_class,
    source_ref,
    summary,
    findings,
    verdicts
  ) values (
    p_session_id,
    p_source_class,
    left(p_source_ref, 1000),
    left(p_summary, 4000),
    coalesce(p_findings, '[]'::jsonb),
    p_verdicts
  );

  update public.cos_council_sessions set
    status = 'verified',
    verified_at = now(),
    verification_source_class = p_source_class,
    verification_source_ref = left(p_source_ref, 1000),
    verification_findings = coalesce(p_findings, '[]'::jsonb)
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'already_verified', false,
    'verified_roles', v_verified,
    'supported_roles', v_supported,
    'refuted_roles', v_refuted
  );
end;
$$;

revoke all on function public.cos_record_council_verified_outcome(uuid,text,text,text,jsonb,jsonb) from public;
revoke all on function public.cos_record_council_verified_outcome(uuid,text,text,text,jsonb,jsonb) from anon;
revoke all on function public.cos_record_council_verified_outcome(uuid,text,text,text,jsonb,jsonb) from authenticated;
grant execute on function public.cos_record_council_verified_outcome(uuid,text,text,text,jsonb,jsonb) to service_role;
