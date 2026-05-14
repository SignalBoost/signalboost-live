import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { prompt, aspect_ratio } = await req.json();

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing prompt." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const finalAspect = aspect_ratio || "9:16";

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    return NextResponse.json(
      {
        error:
          "Video generation is not available from this OpenAI SDK route yet. Use image, voice, or text generation instead.",
      },
      { status: 501 }
    );

    /*
    await supabase.rpc("deduct_credits", {
      uid: user.id,
      used: 5,
    });
    */
  } catch (error) {
    console.error("Video generation error:", error);
    return NextResponse.json(
      { error: "Video generation failed." },
      { status: 500 }
    );
  }
}
