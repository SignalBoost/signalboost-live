import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DAILY_LIMIT = 5;

function languageText(language: string) {
  if (language === "pt") return "Brazilian Portuguese";
  if (language === "es") return "Spanish";
  if (language === "pl") return "Polish";
  if (language === "ru") return "Russian";
  return "English";
}

function isRefusal(text: string) {
  const lower = text.toLowerCase();

  return (
    lower.includes("não posso mostrar") ||
    lower.includes("não consigo mostrar") ||
    lower.includes("cannot show") ||
    lower.includes("can't show") ||
    lower.includes("youtube") ||
    lower.includes("search online") ||
    lower.includes("procurar no youtube")
  );
}

function forcedVideoFallback(prompt: string, language: string) {
  if (language === "pt") {
    return `
# TÍTULO DO VÍDEO
Vídeo Criativo Gerado por IA

# FORMATO
Vídeo vertical 9:16 para TikTok, Instagram Reels e YouTube Shorts.

# HOOK
"Um momento. Uma emoção. Uma história em movimento."

# CENA 1
Visual:
Abertura cinematográfica com luz intensa, movimento de câmera e energia dramática.

Voiceover:
"Tudo começa com uma ideia simples, mas cheia de impacto."

On-screen text:
UM MOMENTO ÉPICO

Sound effects:
Batida cinematográfica, som ambiente e crescimento de tensão.

# CENA 2
Visual:
Sequência principal com ação, emoção e foco no personagem ou tema solicitado.

Voiceover:
"A cena cresce, a emoção aumenta e cada detalhe chama atenção."

On-screen text:
AÇÃO. EMOÇÃO. IMPACTO.

Sound effects:
Impactos suaves, transições rápidas e música crescente.

# CENA 3
Visual:
Momento final poderoso, com câmera lenta, brilho e sensação de conquista.

Voiceover:
"Esse é o tipo de conteúdo que prende o olhar e fica na memória."

On-screen text:
CRIADO COM SIGNALBOOST AI

Sound effects:
Explosão musical, impacto final e fade out.

# ENDING / CTA
Visual:
Tela final com logo, frase de impacto e chamada para ação.

Voiceover:
"Transforme qualquer ideia em conteúdo poderoso."

CTA:
"Crie agora com SignalBoost AI."
`;
  }

  return `
# VIDEO TITLE
AI Generated Creative Video

# FORMAT
Vertical 9:16 video for TikTok, Instagram Reels, and YouTube Shorts.

# HOOK
"One moment. One emotion. One story in motion."

# SCENE 1
Visual:
A cinematic opening with dramatic lighting, camera movement, and strong visual energy.

Voiceover:
"Every powerful piece of content starts with one simple idea."

On-screen text:
AN EPIC MOMENT

Sound effects:
Cinematic hit, ambient sound, rising tension.

# SCENE 2
Visual:
Main action sequence focused on the requested subject, emotion, or story.

Voiceover:
"The scene builds. The emotion rises. Every detail pulls the viewer in."

On-screen text:
ACTION. EMOTION. IMPACT.

Sound effects:
Soft impacts, quick transitions, rising music.

# SCENE 3
Visual:
Powerful final moment with slow motion, glow, and a feeling of victory.

Voiceover:
"This is the kind of content that captures attention and stays remembered."

On-screen text:
CREATED WITH SIGNALBOOST AI

Sound effects:
Music swell, final impact, fade out.

# ENDING / CTA
Visual:
Final branded screen with logo, bold text, and call to action.

Voiceover:
"Turn any idea into powerful content."

CTA:
"Create now with SignalBoost AI."
`;
}

function buildPrompt(mode: string, prompt: string, language: string) {
  const lang = languageText(language);

  if (mode === "video") {
    return `
You must write in ${lang}.

Create a short video generation prompt and production script for this request:

"${prompt}"

The output will be sent to a video generation API.

Do not say you cannot show videos.
Do not mention browsing, YouTube, or real footage.
Do not apologize.

Use exactly this structure:

# VIDEO TITLE
# VIDEO GENERATION PROMPT
# FORMAT
# HOOK
# SCENE 1
Visual:
Voiceover:
On-screen text:
Sound effects:

# SCENE 2
Visual:
Voiceover:
On-screen text:
Sound effects:

# SCENE 3
Visual:
Voiceover:
On-screen text:
Sound effects:

# ENDING / CTA
`;
  }

  if (mode === "visual") {
    return `
Write in ${lang}.

Create a VISUAL CREATIVE BRIEF for:

"${prompt}"

Never say you cannot show images.

Use:
# VISUAL CONCEPT
# MAIN SUBJECT
# BACKGROUND
# COLORS
# TEXT OVERLAY
# LAYOUT
# STYLE DIRECTION
# IMAGE GENERATION PROMPT
`;
  }

  if (mode === "voice") {
    return `
Write in ${lang}.

Create a spoken narration script for:

"${prompt}"

Use emotion, rhythm, short sentences, and natural spoken pacing.
`;
  }

  return `
Write in ${lang}.

Create a useful, professional response for:

"${prompt}"
`;
}

async function generateVideo(videoPrompt: string) {
  if (!process.env.VIDEO_API_KEY) {
    throw new Error("VIDEO_API_KEY is missing in .env.local");
  }

  /*
    IMPORTANT:
    Replace this URL and response parsing with your real video provider.

    Examples of providers:
    - Runway
    - Luma
    - Pika
    - Kling
    - Replicate video models
    - Stability video models
  */

  const res = await fetch("https://api.example-video-provider.com/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VIDEO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: videoPrompt,
      aspect_ratio: "9:16",
      duration: 8,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Video generation failed: ${errorText}`);
  }

  const data = await res.json();

  if (!data.video_url) {
    throw new Error("Video provider did not return video_url.");
  }

  return data.video_url;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt = body.prompt;
    const mode = body.mode || "strategy";
    const language = body.language || "en";
    const user_id = body.user_id;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." });
    }

    if (!user_id) {
      return NextResponse.json({ error: "User ID missing." });
    }

    const today = new Date().toISOString().split("T")[0];

    let { data: usage } = await supabase
      .from("usage_limits")
      .select("*")
      .eq("user_id", user_id)
      .eq("usage_date", today)
      .single();

    if (!usage) {
      const { data: newUsage } = await supabase
        .from("usage_limits")
        .insert([
          {
            user_id,
            usage_date: today,
            generations_count: 0,
          },
        ])
        .select()
        .single();

      usage = newUsage;
    }

    if (usage.generations_count >= DAILY_LIMIT) {
      return NextResponse.json({
        error: "Daily free limit reached.",
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are SignalBoost AI, a creative production platform. You create scripts, production plans, creative briefs, voice scripts, visual concepts, video generation prompts, and marketing assets. Never behave like a search assistant.",
        },
        {
          role: "user",
          content: buildPrompt(mode, prompt, language),
        },
      ],
    });

    let result =
      completion.choices[0]?.message?.content || "No response generated.";

    if (mode === "video" && isRefusal(result)) {
      result = forcedVideoFallback(prompt, language);
    }

    let video_url = "";

    if (mode === "video") {
      try {
        video_url = await generateVideo(result);
      } catch (videoError: any) {
        console.error("VIDEO_GENERATION_ERROR:", videoError);

        result += `

# VIDEO STATUS
Video script created successfully, but video rendering is not connected yet.

Technical message:
${videoError.message}
`;
      }
    }

    await supabase.from("generations").insert([
      {
        user_id,
        prompt: `[${language.toUpperCase()}][${mode.toUpperCase()}] ${prompt}`,
        result,
      },
    ]);

    await supabase
      .from("usage_limits")
      .update({
        generations_count: usage.generations_count + 1,
      })
      .eq("id", usage.id);

    return NextResponse.json({
      result,
      video_url,
      mode,
      language,
      remaining: DAILY_LIMIT - (usage.generations_count + 1),
    });
  } catch (error: any) {
    console.error("AI_GENERATION_ERROR:", error);

    return NextResponse.json({
      error: error.message || "AI generation failed.",
    });
  }
}
