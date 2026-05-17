// saas/lib/supabaseClient.ts
// Re-exports the real browser Supabase client from utils/supabase/client.
// Previously this file contained a mock that returned fake user data.
// New code should import from "@/utils/supabase/client".

export { supabase } from "@/utils/supabase/client";
