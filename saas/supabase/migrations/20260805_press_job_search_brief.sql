-- saas/supabase/migrations/20260805_press_job_search_brief.sql
--
-- ONE COLUMN, BECAUSE A CAMPAIGN HAS TWO DIFFERENT TEXTS AND THEY WERE THE SAME FIELD.
--
-- `goal` is the ANNOUNCEMENT a press release is written around, and it is deliberately short:
-- "Announce Self-Healing Supervisor and SignalBoost AI Marketing and Sales Software to the
-- press." Reducing the owner's long brief to that fixed the releases — they had been written
-- around his research instructions.
--
-- But the same field was also the SEARCH QUERY for finding outlets, and every word that told
-- the finder WHICH press to look for — IT and technology magazines, cloud, SaaS, DevOps, SRE,
-- MSP, cybersecurity, marketing and sales publications, trade journals — lived in the part
-- that had just been stripped. Discovery went looking for "press" in general, surfaced
-- letters-to-the-editor guides, and the admission gate correctly refused all of them. Two
-- consecutive jobs queued zero drafts with every layer behaving exactly as designed.
--
-- So the brief is kept alongside the announcement: one text to search with, one to write from.
--
-- Safe to run twice. Existing rows fall back to `goal`, which is the behaviour they had.

alter table public.press_campaign_jobs
  add column if not exists search_brief text;

comment on column public.press_campaign_jobs.search_brief is
  'The owner''s original brief, used as the outlet-search query. goal holds the short announcement the release is written around.';
