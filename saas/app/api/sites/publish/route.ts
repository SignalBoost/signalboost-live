// saas/app/api/sites/publish/route.ts
// Publishes a REAL website.
// Takes generated content + a business name, creates/updates the user's
// website project, assigns a unique public handle, stores the content,
// sets status to 'live', and returns the real public URL (/s/<handle>).
//
// Depends on:
//   - getCurrentUser / getAdminSupabase  (utils/supabase/server.ts)
//   - projects table with content + handle columns (migration)
//   - public renderer at /s/[handle]/page.tsx

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

// Turn a business name into a URL-safe slug.
function slugify(input: string): string {
  const base = (input || 'site')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')      // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, '')          // trim hyphens
    .slice(0, 40)
  return base || 'site'
}

// Find a handle not already taken in the projects table.
async function uniqueHandle(admin: ReturnType<typeof getAdminSupabase>, desired: string): Promise<string> {
  let candidate = desired
  let n = 1
  // Try the base, then base-2, base-3, ... until free.
  // Bounded loop so it can never run away.
  for (let attempt = 0; attempt < 50; attempt++) {
    const { data, error } = await admin
      .from('projects')
      .select('id')
      .eq('handle', candidate)
      .maybeSingle()
    if (error) break
    if (!data) return candidate // free
    n += 1
    candidate = `${desired}-${n}`
  }
  // Fallback: append a short random suffix.
  return `${desired}-${Math.random().toString(36).slice(2, 6)}`
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to publish your website.' }, { status: 401 })
    }

    const body = await req.json()
    const content = body?.content
    const projectId: string | undefined = body?.projectId

    if (!content || typeof content !== 'object' || !Array.isArray(content.sections)) {
      return NextResponse.json({ error: 'No website content to publish. Please generate the site first.' }, { status: 400 })
    }

    const admin = getAdminSupabase()
    const businessName: string =
      (typeof content.businessName === 'string' && content.businessName.trim()) ||
      (typeof content.headline === 'string' && content.headline.trim()) ||
      'My website'
    const language: string = typeof body?.language === 'string' ? body.language : 'en'

    // ── Case A: updating an existing project the user owns ──
    if (projectId && typeof projectId === 'string') {
      const { data: existing, error: findErr } = await admin
        .from('projects')
        .select('id, user_id, handle')
        .eq('id', projectId)
        .maybeSingle()

      if (findErr || !existing) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
      }
      if (existing.user_id !== user.id) {
        return NextResponse.json({ error: 'You do not have permission to publish this project.' }, { status: 403 })
      }

      const handle = existing.handle || (await uniqueHandle(admin, slugify(businessName)))

      const { error: updErr } = await admin
        .from('projects')
        .update({
          content,
          handle,
          status: 'live',
          name: businessName,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', projectId)

      if (updErr) {
        console.error('Publish update error', updErr)
        return NextResponse.json({ error: 'Could not publish your website. Please try again.' }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        handle,
        url: `/s/${handle}`,
        userMessage: 'Your website is live.',
      })
    }

    // ── Case B: creating a new website project ──
    const handle = await uniqueHandle(admin, slugify(businessName))

    const { data: created, error: insErr } = await admin
      .from('projects')
      .insert({
        user_id: user.id,
        name: businessName,
        type: 'website',
        language,
        status: 'live',
        content,
        handle,
        last_edited_at: new Date().toISOString(),
      })
      .select('id, handle')
      .single()

    if (insErr || !created) {
      console.error('Publish insert error', insErr)
      return NextResponse.json({ error: 'Could not publish your website. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      projectId: created.id,
      handle: created.handle,
      url: `/s/${created.handle}`,
      userMessage: 'Your website is live.',
    })
  } catch (error) {
    console.error('Sites publish error', error)
    return NextResponse.json({ error: 'Something went wrong while publishing.' }, { status: 500 })
  }
}
