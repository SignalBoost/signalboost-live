// saas/lib/supabaseClient.ts
// Re-exports the real browser Supabase client from utils/supabase/client.
// Previously this file contained a mock that returned fake user data and
// hardcoded credits. The mock has been removed — this is now a real client.
//
// New code should import directly from "@/utils/supabase/client".
// This file exists only for backwards compatibility with existing imports.

export { supabase } from "@/utils/supabase/client";
