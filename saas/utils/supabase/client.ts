import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Notice the "export const" here. This makes it a named export!
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
