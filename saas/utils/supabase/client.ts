// saas/utils/supabase/client.ts
// Browser-side Supabase client using @supabase/ssr.
// Stores the session in cookies (NOT localStorage) so server routes
// can read it via createServerClient.

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
