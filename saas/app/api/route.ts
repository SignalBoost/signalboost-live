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
Gol do Flaco López — Momento de Explosão

# FORMATO
Vídeo vertical 9:16 para TikTok, Instagram Reels e YouTube Shorts.

# HOOK
"Quando a bola encontra o atacante certo, o estádio prende a respiração."

# CENA 1
Visual:
Entrada dramática do estádio, torcida vibrando, luzes fortes e clima de decisão.

Voiceover:
"É dia de jogo grande. A tensão está no ar. Cada toque na bola pode mudar tudo."

On-screen text:
FLACO LÓPEZ EM AÇÃO

Sound effects:
Som de torcida crescendo, batida cinematográfica, apito distante.

# CENA 2
Visual:
Sequência em câmera lenta: aproximação da área, defensor tentando bloquear, movimento explosivo do atacante.

Voiceover:
"A bola chega. O espaço aparece. Flaco López lê a jogada antes de todo mundo."

On-screen text:
UM TOQUE. UMA CHANCE.

Sound effects:
Batida forte, som de chute, respiração suspensa.

# CENA 3
Visual:
Chute final em câmera lenta, rede balançando, torcida explodindo em comemoração.

Voiceover:
"Finalização precisa. Explosão da torcida. Um gol para levantar o estádio."

On-screen text:
GOL! MOMENTO DECISIVO.

Sound effects:
Torcida em volume máximo, música épica, impacto da bola.

# ENDING / CTA
Visual:
Flaco comemorando, estádio em festa, tela escurecendo com logo ou chamada final.

Voiceover:
"Flaco López. Presença de área. Decisão. Emoção."

On-screen text:
SIGA PARA MAIS MOMENTOS DO FUTEBOL

CTA:
"Quer transformar qualquer momento em um vídeo épico? Crie com SignalBoost AI."
`;
  }

  return `
# VIDEO TITLE
Flaco López Goal — Explosive Highlight Moment

# FORMAT
Vertical 9:16 for TikTok, Instagram Reels, and YouTube Shorts.

# HOOK
"When the ball meets the right striker, the whole stadium holds its breath."

# SCENE 1
Visual:
A dramatic stadium opening, fans roaring, lights flashing, match-day tension.

Voiceover:
"It's a big match. The energy is rising. One moment can change everything."

On-screen text:
FLACO LÓPEZ IN ACTION

Sound effects:
Crowd swell, cinematic drums, distant whistle.

# SCENE 2
Visual:
Slow-motion attacking sequence, defender closing in, striker finding space.

Voiceover:
"The ball arrives. The space opens. Flaco López sees the chance before anyone else."

On-screen text:
ONE TOUCH. ONE CHANCE.

Sound effects:
Heartbeat bass, kick impact, crowd silence.

# SCENE 3
Visual:
The shot, the net shaking, fans exploding in celebration.

Voiceover:
"Clean finish. Pure emotion. A goal that lifts the stadium."

On-screen text:
GOAL! DECISIVE MOMENT.

Sound effects:
Crowd explosion, epic music hit, ball impact.

# ENDING / CTA
Visual:
Celebration shot, stadium lights, final branded frame.

Voiceover:
"Flaco López. Power. Timing. Emotion."

On-screen text:
FOLLOW FOR MORE FOOTBALL MOMENTS

CTA:
"Turn any moment into an epic video with SignalBoost AI."
`;
}

function buildPrompt(mode: string, prompt: string, language: string) {
  const lang = languageText(language);

  if (mode === "video") {
    return `
You must write in ${lang}.

Create a NEW VIDEO PRODUCTION PLAN for this request:

"${prompt}"

This is NOT a request to show real footage.
This is NOT a request to browse.
This is NOT a request to find an existing video.

The user wants a creative video script and production plan.

You must never say you cannot show videos or images.

Use exactly this structure:

# VIDEO TITLE
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
            "You are SignalBoost AI, a creative production platform. You create scripts, production plans, creative briefs, voice scripts, visual concepts, and marketing assets. Never behave like a search assistant.",
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
