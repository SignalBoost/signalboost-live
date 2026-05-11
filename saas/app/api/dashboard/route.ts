import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Dashboard API working",
    stats: {
      projects: 12,
      automations: 5,
      blogs: 24
    }
  });
}
