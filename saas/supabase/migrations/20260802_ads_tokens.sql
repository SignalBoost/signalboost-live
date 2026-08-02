-- saas/supabase/migrations/20260802_ads_tokens.sql
--
-- STORED AD-NETWORK TOKENS, SO A CONNECTION CAN BE RENEWED INSTEAD OF RE-TYPED.
--
-- The ads surface began by reading access tokens from environment variables, which is
-- correct for exactly none of these networks. Meta and LinkedIn tokens last about sixty
-- days. Pinterest is around thirty. TikTok, Snapchat and Reddit issue tokens measured in
-- hours with a refresh token beside them. An environment variable cannot renew itself, so
-- every one of those connections would have died quietly a few weeks after setup — and a
-- dead ads connection looks exactly like a campaign that finished.
--
-- ONE ROW PER NETWORK, not per user. Paid advertising is an owner-gated surface: the
-- company connects its ad account once, and everyone who is allowed to spend uses that
-- connection. A per-user token would mean a campaign stops when a person leaves.
--
-- EXPIRY IS COPIED ONTO ads_account_health so the attention watcher can warn before it
-- lapses rather than reporting the failure afterwards. That is the whole point of storing
-- it: a token nobody is watching is only marginally better than one in an env var.

create table if not exists ads_tokens (
  id             uuid primary key default gen_random_uuid(),
  platform_id    text        not null,
  account_ref    text,
  access_token   text        not null,
  refresh_token  text,
  expires_at     timestamptz,
  scopes         text[]      not null default '{}',
  connected_by   text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_error     text,

  constraint ads_tokens_unique unique (platform_id)
);

create index if not exists ads_tokens_expiry_idx on ads_tokens (expires_at);

comment on table ads_tokens is
  'One OAuth connection per ad network, owner-level. Refreshed automatically before use; never per-user, so a campaign does not stop when a person leaves.';
comment on column ads_tokens.expires_at is
  'Null means the network did not say and we have no documented lifetime. Null is treated as UNKNOWN, never as safe — an unwatched token is the failure this table exists to prevent.';
comment on column ads_tokens.refresh_token is
  'Replaced whenever a network rotates it. Keeping a stale one is how a connection survives the first renewal and dies at the second.';
comment on column ads_tokens.last_error is
  'The reason the most recent renewal failed, kept so the cockpit can say why a network went quiet instead of showing an empty connection.';
