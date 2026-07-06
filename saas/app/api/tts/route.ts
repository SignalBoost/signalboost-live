// saas/app/api/tts/route.ts
// POST /api/tts
// Body: { text: string, voiceId: string }
// Returns: { audioUrl, cached, characters, remaining }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { isAllowedVoice, DEFAULT_MODEL_ID } from "@/lib/elevenlabs/voices";
import {
  HARD_PER_REQUEST_CHAR_LIMIT,
  getMonthlyLimit,
  type PlanId,
} from "@/lib/elevenlabs/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const STORAGE_BUCKET = "tts-cache";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_AUDIO_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const STORAGE_OPERATION_TIMEOUT_MS = 15_000;

export async function POST(req: NextRequest) {
  let body: { text?: string; voiceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const voiceId = body.voiceId ?? "";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > HARD_PER_REQUEST_CHAR_LIMIT) {
    return NextResponse.json(
      { error: `Text exceeds the per-request limit of ${HARD_PER_REQUEST_CHAR_LIMIT} characters` },
      { status: 400 },
    );
  }
  if (!isAllowedVoice(voiceId)) {
    return NextResponse.json({ error: "Voice not allowed" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const plan = await getUserPlan(supabaseAdmin, user.id);
  const monthlyLimit = getMonthlyLimit(plan);
  const usedThisMonth = await getMonthlyUsage(supabaseAdmin, user.id);
  const remaining = monthlyLimit - usedThisMonth;

  if (remaining < text.length) {
    return NextResponse.json(
      { error: "Monthly character limit reached", remaining, monthlyLimit, plan },
      { status: 429 },
    );
  }

  const hash = sha256(`${text}::${voiceId}::${DEFAULT_MODEL_ID}`);

  const { data: cached } = await supabaseAdmin
    .from("tts_cache")
    .select("storage_key, hit_count")
    .eq("hash", hash)
    .maybeSingle();

  if (cached) {
    void supabaseAdmin
      .from("tts_cache")
      .update({
        last_used_at: new Date().toISOString(),
        hit_count: (cached.hit_count ?? 0) + 1,
      })
      .eq("hash", hash);

    await supabaseAdmin.from("tts_usage").insert({
      user_id: user.id,
      characters: text.length,
      voice_id: voiceId,
      model_id: DEFAULT_MODEL_ID,
      cache_hit: true,
    });

    try {
      const signedUrl = await getSignedUrl(supabaseAdmin, cached.storage_key);
      return NextResponse.json({
        audioUrl: signedUrl,
        cached: true,
        characters: text.length,
        remaining: remaining - text.length,
      });
    } catch (err) {
      console.error("Cached TTS URL signing failed:", err);
      await supabaseAdmin.from("tts_cache").delete().eq("hash", hash);
    }
  }

  let audioBuffer: ArrayBuffer;
  try {
    audioBuffer = await generateSpeech({ text, voiceId });
  } catch (err) {
    console.error("ElevenLabs generation failed:", err);
    return NextResponse.json(
      { error: "Speech generation failed" },
      { status: 502 },
    );
  }

  const storageKey = `${hash}.mp3`;
  let uploadError: unknown = null;

  try {
    const uploadResult = await uploadTtsAudio(supabaseAdmin, storageKey, audioBuffer);
    uploadError = uploadResult.error;
  } catch (err) {
    uploadError = err;
  }

  if (uploadError) {
    console.error("Storage upload failed:", uploadError);
    return NextResponse.json(
      { error: "Failed to store generated audio" },
      { status: 500 },
    );
  }

  const { error: cacheInsertError } = await supabaseAdmin.from("tts_cache").insert({
    hash,
    storage_key: storageKey,
    characters: text.length,
  });

  if (cacheInsertError && cacheInsertError.code !== "23505") {
    console.error("TTS cache insert failed:", cacheInsertError);
  }

  const { error: usageInsertError } = await supabaseAdmin.from("tts_usage").insert({
    user_id: user.id,
    characters: text.length,
    voice_id: voiceId,
    model_id: DEFAULT_MODEL_ID,
    cache_hit: false,
  });

  if (usageInsertError) {
    console.error("TTS usage insert failed:", usageInsertError);
  }

  try {
    const signedUrl = await getSignedUrl(supabaseAdmin, storageKey);
    return NextResponse.json({
      audioUrl: signedUrl,
      cached: false,
      characters: text.length,
      remaining: remaining - text.length,
    });
  } catch (err) {
    console.error("TTS URL signing failed:", err);
    return NextResponse.json(
      { error: "Audio was generated but the playback link could not be created" },
      { status: 500 },
    );
  }
}

// ---------- Helpers ----------

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function uploadTtsAudio(
  supabase: any,
  storageKey: string,
  audioBuffer: ArrayBuffer,
): Promise<{ error: unknown }> {
  await ensureTtsBucket(supabase);

  const audioBytes = Buffer.from(audioBuffer);
  const firstUpload = await withTimeout(
    supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      }),
    STORAGE_OPERATION_TIMEOUT_MS,
    "TTS storage upload timed out",
  );

  if (!firstUpload.error || !isMissingBucketError(firstUpload.error)) {
    return { error: firstUpload.error };
  }

  await ensureTtsBucket(supabase, true);

  const retryUpload = await withTimeout(
    supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      }),
    STORAGE_OPERATION_TIMEOUT_MS,
    "TTS storage retry upload timed out",
  );

  return { error: retryUpload.error };
}

async function ensureTtsBucket(supabase: any, forceCreate = false): Promise<void> {
  if (!forceCreate) {
    const { data, error } = await withTimeout(
      supabase.storage.getBucket(STORAGE_BUCKET),
      STORAGE_OPERATION_TIMEOUT_MS,
      "TTS storage bucket check timed out",
    );
    if (data && !error) return;

    if (error && !isMissingBucketError(error)) {
      console.warn("Unable to verify TTS storage bucket before upload:", error);
    }
  }

  const { error: createError } = await withTimeout(
    supabase.storage.createBucket(STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: MAX_AUDIO_FILE_SIZE_BYTES,
      allowedMimeTypes: ["audio/mpeg"],
    }),
    STORAGE_OPERATION_TIMEOUT_MS,
    "TTS storage bucket creation timed out",
  );

  if (createError && !isAlreadyExistsError(createError)) {
    throw new Error(`Failed to create TTS storage bucket: ${formatSupabaseError(createError)}`);
  }
}

function isMissingBucketError(error: unknown): boolean {
  const message = formatSupabaseError(error).toLowerCase();
  return (
    message.includes("bucket not found") ||
    message.includes("bucket_not_found") ||
    (message.includes("storage bucket") && message.includes("not found"))
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = formatSupabaseError(error).toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("already_exist") ||
    message.includes("duplicate key") ||
    message.includes("409")
  );
}

function formatSupabaseError(error: unknown): string {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function getSignedUrl(supabase: any, storageKey: string): Promise<string> {
  const { data, error } = await withTimeout(
    supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS),
    STORAGE_OPERATION_TIMEOUT_MS,
    "TTS signed URL creation timed out",
  );
  if (error || !data) {
    throw new Error(`Failed to sign URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

async function getUserPlan(supabase: any, userId: string): Promise<PlanId> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!data?.plan) return "trial";
  const plan = String(data.plan).toLowerCase();
  if (["trial", "starter", "pro", "business"].includes(plan)) {
    return plan as PlanId;
  }
  return "trial";
}

async function getMonthlyUsage(supabase: any, userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("tts_usage")
    .select("characters")
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  if (!data) return 0;
  return data.reduce((sum: number, row: any) => sum + (row.characters ?? 0), 0);
}
