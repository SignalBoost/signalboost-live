import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required." },
        { status: 400 }
      );
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing FAL_KEY." },
        { status: 500 }
      );
    }

    const result: any = await fal.subscribe(
      "fal-ai/kling-video/v1/standard/text-to-video",
      {
        input: {
          prompt,
        },
      }
    );

    console.log("FAL RAW RESULT:", JSON.stringify(result, null, 2));

    const videoUrl =
      result?.data?.video?.url ||
      result?.data?.video_url ||
      result?.data?.videos?.[0]?.url ||
      result?.data?.output?.url ||
      result?.video?.url ||
      result?.video_url ||
      result?.videos?.[0]?.url ||
      null;

    if (!videoUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Video generated but no playable video URL was found.",
          raw: result,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      videoUrl,
      raw: result,
    });
  } catch (error: any) {
    console.error("VIDEO_GENERATION_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Video generation failed.",
      },
      { status: 500 }
    );
  }
}
