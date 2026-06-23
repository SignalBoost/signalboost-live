import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    // NOTE: image generation is not yet wired to a provider. Returns a demo
    // asset, flagged mock:true so callers don't treat it as real output.
    return NextResponse.json({ success: true, mock: true, image_url: "/demo/sample.png" });
  } catch (err) {
    console.error("generate-graphic route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
