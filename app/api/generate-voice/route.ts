import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    return NextResponse.json({
      success: true,
      audio_url: "/demo/sample.mp3"
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}
