-- Reviews Stage 1: smart routing and media bucket support.
alter table public.reviews
  add column if not exists sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  add column if not exists public_destination text not null default 'private' check (public_destination in ('public', 'private'));

create index if not exists reviews_owner_destination_idx
  on public.reviews (owner_id, public_destination, created_at desc);

insert into storage.buckets (id, name, public)
values ('review-media', 'review-media', true)
on conflict (id) do update set public = excluded.public;
