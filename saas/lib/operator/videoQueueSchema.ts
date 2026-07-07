export const COS_VIDEO_QUEUE_SQL = `
create table if not exists public.cos_video_production_jobs (
  id uuid primary key,
  title text,
  status text not null default 'queued'
);
`.trim()
