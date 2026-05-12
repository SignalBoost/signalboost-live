import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = body.prompt;

    if (!prompt) {
      return Response.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const result = await fal.subscribe(
      "fal-ai/kling-video/v1/standard/text-to-video",
      {
        input: {
          prompt,
          duration: "5",
          aspect_ratio: "16:9",
        },
        logs: true,
      }
    );

    console.log("FAL RESULT:", result);

    return Response.json(result);
  } catch (error: any) {
    console.error(error);

    return Response.json(
      {
        error: error.message || "Video generation failed",
      },
      { status: 500 }
    );
  }
}
