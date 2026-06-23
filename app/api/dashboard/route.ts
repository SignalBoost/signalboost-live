import { NextResponse } from "next/server";

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          success: false,
          error: "Dashboard mock endpoint is not available in production"
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mock: true,
      stats: {
        projects: 12,
        automations: 5,
        blogs: 24
      }
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
