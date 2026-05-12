import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: true,
    videoUrl:
      "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4",
  });
}
