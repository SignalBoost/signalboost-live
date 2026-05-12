import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    stats: {
      projects: 12,
      automations: 5,
      content: 24
    }
  });
}
