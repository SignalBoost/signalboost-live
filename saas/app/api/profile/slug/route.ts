import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'dashboard', 'login', 'signup', 'signin',
  'logout', 'auth', 'account', 'settings', 'profile', 'pricing',
  'about', 'contact', 'support', 'help', 'terms', 'privacy',
  'legal', 'blog', 'docs', 'review', 'reviews', 'www', 'mail',
  'ftp', 'root', 'null', 'undefined', 'test', 'staging', 'dev',
  'signalboost', 'signal-boost', 'signalboostapp',
]);

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

async function getAuthedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get: (name: string) => cookieStore.get(name)?.value,
      set: () => {},
      remove: () => {},
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = admin();
  const { data, error } = await db
    .from('profiles')
    .select('slug')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slug: data?.slug ?? null });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!raw) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
  }

  if (!SLUG_REGEX.test(raw)) {
    return NextResponse.json(
      { error: 'Slug must be 3–32 chars, lowercase letters, numbers, and hyphens. No leading/trailing hyphen.' },
      { status: 400 }
    );
  }

  if (RESERVED_SLUGS.has(raw)) {
    return NextResponse.json({ error: 'That slug is reserved. Please choose another.' }, { status: 400 });
  }

  const db = admin();

  // Check if slug is already taken by someone else
  const { data: existing, error: existingErr } = await db
    .from('profiles')
    .select('id')
    .eq('slug', raw)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: 'That slug is already taken.' }, { status: 409 });
  }

  // Upsert into profiles
  const { error: upsertErr } = await db
    .from('profiles')
    .upsert({ id: user.id, slug: raw }, { onConflict: 'id' });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ slug: raw });
}
