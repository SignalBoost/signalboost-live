-- Disposable PostgreSQL integration fixture; never run on a production database.
BEGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.builder_jobs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, workspace_id uuid, conversation_id uuid,
 history_message_id uuid, status text NOT NULL, claim_generation integer NOT NULL,
 job_kind text NOT NULL DEFAULT 'standard', checkpoint jsonb, metadata jsonb DEFAULT '{}'::jsonb,
 result jsonb, error text, finished_at timestamptz, updated_at timestamptz NOT NULL,
 last_heartbeat_at timestamptz
);
CREATE TABLE public.assistant_messages (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, content text, provenance jsonb
);
CREATE TABLE public.assistant_conversations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, updated_at timestamptz
);
COMMIT;
