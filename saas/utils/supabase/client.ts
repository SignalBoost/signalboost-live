// saas/utils/supabase/client.ts
// Real browser Supabase client using @supabase/ssr.
// Session lives in cookies (not localStorage), so server-side API routes
// can read it from the request cookies.

import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
