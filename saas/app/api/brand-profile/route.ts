// saas/app/api/brand-profile/route.ts

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("GET brand_profile error:", error);
    return NextResponse.json(
      { error: "Failed to load brand profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data });
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();

  const payload = {
    user_id: user.id,
    brand_name: body.brand_name ?? null,
    brand_tagline: body.brand_tagline ?? null,
    brand_tone: body.brand_tone ?? null,
    formality_level: body.formality_level ?? null,
    primary_audience: body.primary_audience ?? null,
    brand_personality: body.brand_personality ?? null,
    primary_language: body.primary_language ?? null,
    secondary_languages: body.secondary_languages ?? null,
    cultural_notes: body.cultural_notes ?? null,
    preferred_colors: body.preferred_colors ?? null,
    layout_style: body.layout_style ?? null,
    visual_notes: body.visual_notes ?? null,
  };

  const { data, error } = await supabase
    .from("brand_profiles")
    .upsert(payload, {
      onConflict: "user_id",
    })
    .select("*")
    .single();

  if (error) {
    console.error("POST brand_profile error:", error);
    return NextResponse.json(
      { error: "Failed to save brand profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data });
}
