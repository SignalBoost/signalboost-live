-- Persist authoritative execution provenance with each assistant message so a later
-- multi-turn introspection question can report what actually happened on the prior turn.
-- Existing rows remain valid: provenance is nullable because historical turns predate
-- this telemetry and must never be backfilled with guessed data.

alter table if exists public.assistant_messages
  add column if not exists provenance jsonb;

comment on column public.assistant_messages.provenance is
  'Authoritative server execution provenance captured for this assistant turn. NULL means no provenance was recorded; never infer or fabricate it.';

create index if not exists assistant_messages_conversation_provenance_idx
  on public.assistant_messages (conversation_id, created_at desc)
  where role = 'assistant' and provenance is not null;
