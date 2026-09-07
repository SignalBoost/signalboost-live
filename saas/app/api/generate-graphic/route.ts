import { NextResponse } from "next/server";
import { generateCosCreativeImage } from "@/lib/cos/creative-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const prompt = body && typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "A non-empty 'prompt' string is required" },
        { status: 400 }
      );
    }

    const generated = await generateCosCreativeImage({
      prompt,
      campaignKey: "api-generate-graphic",
      title: "Generated graphic",
    });

    if (!generated.ok) {
      console.warn("[generate-graphic] COS image generation failed", generated.error);
      return NextResponse.json(
        { success: false, error: generated.error },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      mock: false,
      image_url: generated.imageUrl,
      object_path: generated.objectPath,
      bucket: generated.bucket,
      model: generated.model,
    });
  } catch (err) {
    console.error("generate-graphic route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
