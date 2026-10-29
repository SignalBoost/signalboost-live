-- Existing Assistant history foundation for isolated staging only.
-- Apply before the existing Builder workspace/job migrations.
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text, summary text,
 message_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assistant_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('user','assistant')),
 content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 provenance jsonb
);
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_conversations, public.assistant_messages FROM anon, authenticated;
