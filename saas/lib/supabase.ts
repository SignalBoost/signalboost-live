import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Y2hheWd0eHVidWZ4a3pmcG5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNzEzNDEsImV4cCI6MjA5Mzk0NzM0MX0.J6GZlO3as_jBh5s4i_S6xEDSfgkNubTd0YNxqzkIXxA!;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
