// saas/app/api/video/route.ts
// POST /api/video
// Accepts multipart/form-data: { file: File, langs: string (comma-separated), formats: string (comma-separated) }
// Returns: { jobId, status, captions: { lang, srt, vtt, ass }[], transcript, chapters, duration }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { saasSupabaseCookieOptions } from "@/lib/auth/cookies";
import { cookies } from "next/headers";
import {
  uploadAudio,
  startTranscription,
  pollTranscription,
  wordsToCaption,
  captionEntriesToSRT,
  captionEntriesToVTT,
  captionEntriesToASS,
  type TranscriptResult,
} from "@/lib/assemblyai/client";
import {
  defaultVideoQuotaMb,
  evaluateVideoAccess,
  normalizeSubscriptionTier,
  type SubscriptionTier,
  type VideoAccessDecision,
  type VideoUsageSnapshot,
} from "@/lib/video/tieredAccess";

const VIDEO_BUCKET = "video-jobs";
const SIGNED_URL_TTL = 60 * 60 * 6; // 6 hours

// Plan limits: max video duration in minutes
const PLAN_VIDEO_LIMITS: Record<string, number> = {
  trial: 5,
  starter: 30,
  pro: 120,
  business: 999,
};

const SUPPORTED_LANGS = ["en", "pt", "es", "pl", "ru"];

const LANG_NAMES: Record<string, string> = {
  en: "English",
  pt: "Português",
  es: "Español",
  pl: "Polski",
  ru: "Русский",
};

// GPT translation prompt per language
const TRANSLATE_PROMPTS: Record<string, string> = {
  pt: "Translate the following English text to Brazilian Portuguese. Preserve all punctuation and line breaks. Return only the translated text.",
  es: "Translate the following English text to Spanish (LATAM). Preserve all punctuation and line breaks. Return only the translated text.",
  pl: "Translate the following English text to Polish. Preserve all punctuation and line breaks. Return only the translated text.",
  ru: "Translate the following English text to Russian. Preserve all punctuation and line breaks. Return only the translated text.",
};

export const maxDuration = 300; // 5 min Vercel function timeout (Pro plan needed for longer)

// Pulls a readable message out of any thrown value.
function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
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

  // Early env sanity check — surfaces the real cause instead of a vague 502 later.
  const missingEnv: string[] = [];
  if (!process.env.ASSEMBLYAI_API_KEY) missingEnv.push("ASSEMBLYAI_API_KEY");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missingEnv.length) {
    return NextResponse.json(
      {
        error: `Server config error: missing env var(s): ${missingEnv.join(", ")}`,
      },
      { status: 500 },
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // ── Parse multipart form ──────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid form data: ${errMsg(err)}` },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  const langsRaw = (formData.get("langs") as string | null) ?? "en";
  const formatsRaw = (formData.get("formats") as string | null) ?? "srt";
  const overageAccepted =
    ((formData.get("overageAccepted") as string | null) ?? "false") === "true";
  const billingProviderRaw =
    (formData.get("billingProvider") as string | null) ?? "stripe";
  const billingProvider = billingProviderRaw === "paypal" ? "paypal" : "stripe";

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
  ];
  if (
    !allowedTypes.includes(file.type) &&
    !file.name.match(/\.(mp4|mov|avi|mkv|webm|mp3|wav|m4a)$/i)
  ) {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 400 },
    );
  }

  const langs = langsRaw
    .split(",")
    .map((l) => l.trim())
    .filter((l) => SUPPORTED_LANGS.includes(l));
  if (!langs.length) langs.push("en");

  const formats = formatsRaw
    .split(",")
    .map((f) => f.trim())
    .filter((f) => ["srt", "vtt", "ass"].includes(f));
  if (!formats.length) formats.push("srt");

  // ── Tiered access check ───────────────────────────────────────────────────
  const plan = await getUserPlan(supabaseAdmin, user.id);
  const fileSizeMB = file.size / (1024 * 1024);
  const usage = await getVideoUsage(supabaseAdmin, user.id, plan);
  const preflightAccess = evaluateVideoAccess({
    usage,
    uploadSizeMb: fileSizeMB,
    overageAccepted,
    billingProvider,
  });

  if (preflightAccess.status === "blocked") {
    return NextResponse.json(
      {
        error: accessMessage(preflightAccess),
        access: preflightAccess,
      },
      { status: preflightAccess.subscriptionTier === "free" ? 413 : 402 },
    );
  }

  // ── Create job record ─────────────────────────────────────────────────────
  const jobId = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin.from("video_jobs").insert({
    id: jobId,
    user_id: user.id,
    file_name: file.name,
    file_size: file.size,
    langs,
    formats,
    status: "uploading",
    plan,
    access_status: preflightAccess.status,
  });
  // If the video_jobs table is missing/misshaped, say so plainly.
  if (insertError) {
    return NextResponse.json(
      {
        error: `Database error creating job (video_jobs): ${insertError.message}`,
      },
      { status: 500 },
    );
  }

  // ── Upload to AssemblyAI ──────────────────────────────────────────────────
  let uploadUrl: string;
  try {
    await supabaseAdmin
      .from("video_jobs")
      .update({ status: "uploading" })
      .eq("id", jobId);
    const buffer = await file.arrayBuffer();
    uploadUrl = await uploadAudio(buffer);
  } catch (err) {
    const m = errMsg(err);
    console.error("AssemblyAI upload error:", err);
    await supabaseAdmin
      .from("video_jobs")
      .update({ status: "error", error: m })
      .eq("id", jobId);
    return NextResponse.json(
      { error: `Upload to AssemblyAI failed: ${m}` },
      { status: 502 },
    );
  }

  // ── Transcribe ────────────────────────────────────────────────────────────
  let transcript: TranscriptResult;
  try {
    await supabaseAdmin
      .from("video_jobs")
      .update({ status: "transcribing" })
      .eq("id", jobId);
    const transcriptId = await startTranscription(uploadUrl, "en");
    transcript = await pollTranscription(transcriptId);

    if (transcript.status === "error") {
      throw new Error(transcript.error ?? "Transcription failed");
    }
  } catch (err) {
    const m = errMsg(err);
    console.error("AssemblyAI transcription error:", err);
    await supabaseAdmin
      .from("video_jobs")
      .update({ status: "error", error: m })
      .eq("id", jobId);
    return NextResponse.json(
      { error: `Transcription failed: ${m}` },
      { status: 502 },
    );
  }

  const finalAccess = evaluateVideoAccess({
    usage,
    uploadSizeMb: fileSizeMB,
    durationSec: Math.round(transcript.audio_duration),
    overageAccepted,
    billingProvider,
  });

  if (finalAccess.status === "blocked") {
    await supabaseAdmin
      .from("video_jobs")
      .update({ status: "blocked", error: accessMessage(finalAccess) })
      .eq("id", jobId);
    await recordVideo(supabaseAdmin, {
      id: jobId,
      accountId: user.id,
      filename: file.name,
      sizeMb: fileSizeMB,
      durationSec: Math.round(transcript.audio_duration),
      status: finalAccess.status,
    });
    return NextResponse.json(
      { error: accessMessage(finalAccess), access: finalAccess },
      { status: 402 },
    );
  }

  const demoCutoffMs = finalAccess.maxDemoDurationSec * 1000;
  const sourceWords =
    finalAccess.status === "demo"
      ? transcript.words.filter((word) => word.start < demoCutoffMs)
      : transcript.words;
  const sourceTranscriptText =
    finalAccess.status === "demo"
      ? sourceWords.map((word) => word.text).join(" ")
      : transcript.text;
  const sourceChapters =
    finalAccess.status === "demo" && Array.isArray(transcript.chapters)
      ? transcript.chapters.filter(
          (chapter) => (chapter.start ?? 0) < demoCutoffMs,
        )
      : transcript.chapters;

  // ── Generate captions for each language ──────────────────────────────────
  await supabaseAdmin
    .from("video_jobs")
    .update({ status: "generating", access_status: finalAccess.status })
    .eq("id", jobId);

  const captionResults: Array<{
    lang: string;
    langName: string;
    srtKey?: string;
    vttKey?: string;
    assKey?: string;
    srtUrl?: string;
    vttUrl?: string;
    assUrl?: string;
  }> = [];

  // Track storage problems so we can report them instead of silently returning no URLs.
  let storageError: string | null = null;

  for (const lang of langs) {
    let words = sourceWords;

    // For non-English, translate the text and rebuild word list with original timestamps
    if (lang !== "en") {
      try {
        const translatedText = await translateText(sourceTranscriptText, lang);
        // Use translated text split back onto original timestamps (approximate)
        words = rebuildWordsFromTranslation(sourceWords, translatedText);
      } catch (err) {
        console.error(`Translation failed for ${lang}:`, err);
        // Fall back to English captions for this language
      }
    }

    const entries = wordsToCaption(words, "srt");
    const result: (typeof captionResults)[0] = {
      lang,
      langName: LANG_NAMES[lang] ?? lang,
    };

    for (const fmt of formats) {
      let content: string;
      let mimeType: string;
      let ext: string;

      if (fmt === "srt") {
        content = captionEntriesToSRT(entries);
        mimeType = "text/plain";
        ext = "srt";
      } else if (fmt === "vtt") {
        const vttEntries = wordsToCaption(words, "vtt");
        content = captionEntriesToVTT(vttEntries);
        mimeType = "text/vtt";
        ext = "vtt";
      } else {
        const assEntries = wordsToCaption(words, "ass");
        content = captionEntriesToASS(assEntries);
        mimeType = "text/plain";
        ext = "ass";
      }

      const storageKey = `${user.id}/${jobId}/${lang}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(VIDEO_BUCKET)
        .upload(storageKey, new Blob([content], { type: mimeType }), {
          upsert: true,
        });

      if (uploadError) {
        // Most common cause: the 'video-jobs' storage bucket doesn't exist.
        storageError = uploadError.message;
        console.error(`Storage upload failed for ${storageKey}:`, uploadError);
      } else {
        const { data: signed } = await supabaseAdmin.storage
          .from(VIDEO_BUCKET)
          .createSignedUrl(storageKey, SIGNED_URL_TTL);

        if (signed?.signedUrl) {
          if (fmt === "srt") {
            result.srtKey = storageKey;
            result.srtUrl = signed.signedUrl;
          }
          if (fmt === "vtt") {
            result.vttKey = storageKey;
            result.vttUrl = signed.signedUrl;
          }
          if (fmt === "ass") {
            result.assKey = storageKey;
            result.assUrl = signed.signedUrl;
          }
        }
      }
    }

    captionResults.push(result);
  }

  // If nothing got a URL and we saw a storage error, fail loudly (no silent "done").
  const anyUrls = captionResults.some((r) => r.srtUrl || r.vttUrl || r.assUrl);
  if (!anyUrls && storageError) {
    await supabaseAdmin
      .from("video_jobs")
      .update({ status: "error", error: storageError })
      .eq("id", jobId);
    return NextResponse.json(
      {
        error: `Captions generated but could not be saved. Storage error (check the '${VIDEO_BUCKET}' bucket exists): ${storageError}`,
      },
      { status: 500 },
    );
  }

  // ── Store transcript ──────────────────────────────────────────────────────
  const transcriptKey = `${user.id}/${jobId}/transcript.json`;
  await supabaseAdmin.storage.from(VIDEO_BUCKET).upload(
    transcriptKey,
    new Blob(
      [
        JSON.stringify({
          ...transcript,
          text: sourceTranscriptText,
          words: sourceWords,
          chapters: sourceChapters,
          access: finalAccess,
        }),
      ],
      { type: "application/json" },
    ),
    { upsert: true },
  );

  // ── Finalise job ──────────────────────────────────────────────────────────
  await supabaseAdmin
    .from("video_jobs")
    .update({
      status: "done",
      duration_seconds: Math.round(transcript.audio_duration),
      captions: captionResults,
      chapters: sourceChapters,
      transcript_text: sourceTranscriptText.slice(0, 5000), // store excerpt for display
      completed_at: new Date().toISOString(),
      access_status: finalAccess.status,
    })
    .eq("id", jobId);

  await finalizeVideoUsage(supabaseAdmin, user.id, usage, finalAccess);
  await recordVideo(supabaseAdmin, {
    id: jobId,
    accountId: user.id,
    filename: file.name,
    sizeMb: fileSizeMB,
    durationSec: Math.round(transcript.audio_duration),
    status: finalAccess.status,
  });

  return NextResponse.json({
    jobId,
    status: "done",
    fileName: file.name,
    duration: Math.round(transcript.audio_duration),
    captions: captionResults,
    chapters: sourceChapters,
    transcriptExcerpt: sourceTranscriptText.slice(0, 500),
    langs,
    formats,
    access: finalAccess,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getVideoUsage(
  supabase: any,
  accountId: string,
  plan: string,
): Promise<VideoUsageSnapshot> {
  const tier: SubscriptionTier = normalizeSubscriptionTier(plan);
  const quotaMb = defaultVideoQuotaMb(tier);
  const { data } = await supabase
    .from("video_usage")
    .select("subscription_tier, quota_mb, used_mb, overage_charges")
    .eq("account_id", accountId)
    .maybeSingle();

  if (!data) {
    await supabase.from("video_usage").upsert(
      {
        account_id: accountId,
        subscription_tier: tier,
        quota_mb: quotaMb,
        used_mb: 0,
        overage_charges: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
  }

  return {
    accountId,
    subscriptionTier: normalizeSubscriptionTier(
      data?.subscription_tier ?? tier,
    ),
    quotaMb: Number(data?.quota_mb ?? quotaMb),
    usedMb: Number(data?.used_mb ?? 0),
    overageCharges: Number(data?.overage_charges ?? 0),
  };
}

function accessMessage(access: VideoAccessDecision): string {
  if (access.subscriptionTier === "free") {
    return `Free demo uploads are limited to ${access.maxDemoDurationSec}s or ${access.maxDemoSizeMb} MB. Upgrade for full video playback and storage.`;
  }
  if (access.billing.chargeRequired && !access.billing.chargeAccepted) {
    return `Video quota exceeded by ${access.billing.overageMb} MB. Accept ${access.billing.provider} overage billing to continue.`;
  }
  return "Video access is blocked for this account.";
}

async function finalizeVideoUsage(
  supabase: any,
  accountId: string,
  usage: VideoUsageSnapshot,
  access: VideoAccessDecision,
) {
  const nextUsedMb =
    access.status === "full"
      ? access.projectedUsedMb
      : usage.usedMb + Math.min(access.uploadSizeMb, access.maxDemoSizeMb);
  const nextCharges =
    Number(usage.overageCharges || 0) +
    Number(access.billing.chargeAccepted ? access.billing.chargeAmount : 0);

  await supabase.from("video_usage").upsert(
    {
      account_id: accountId,
      subscription_tier: access.subscriptionTier,
      quota_mb: access.quotaMb,
      used_mb: Math.round(nextUsedMb),
      overage_charges: nextCharges,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" },
  );
}

async function recordVideo(
  supabase: any,
  video: {
    id: string;
    accountId: string;
    filename: string;
    sizeMb: number;
    durationSec: number;
    status: "demo" | "full" | "blocked";
  },
) {
  await supabase.from("videos").upsert(
    {
      id: video.id,
      account_id: video.accountId,
      filename: video.filename,
      size_mb: Math.round(video.sizeMb),
      duration_sec: video.durationSec,
      status: video.status,
    },
    { onConflict: "id" },
  );
}

async function getUserPlan(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!data?.plan) return "free";
  const plan = String(data.plan).toLowerCase();
  return ["free", "starter", "pro", "business", "enterprise"].includes(plan)
    ? plan
    : "free";
}

async function translateText(
  text: string,
  targetLang: string,
): Promise<string> {
  const prompt = TRANSLATE_PROMPTS[targetLang];
  if (!prompt) return text;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI translation failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? text;
}

// Maps translated text back onto original word timestamps
// Strategy: split translated text into tokens, distribute across original word count
function rebuildWordsFromTranslation(
  originalWords: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>,
  translatedText: string,
): Array<{ text: string; start: number; end: number; confidence: number }> {
  const translatedTokens = translatedText.split(/\s+/).filter(Boolean);
  if (!translatedTokens.length || !originalWords.length) return originalWords;

  const ratio = translatedTokens.length / originalWords.length;
  return translatedTokens.map((text, i) => {
    const srcIndex = Math.min(Math.round(i / ratio), originalWords.length - 1);
    const srcWord = originalWords[srcIndex];
    return {
      text,
      start: srcWord.start,
      end: srcWord.end,
      confidence: srcWord.confidence,
    };
  });
}
