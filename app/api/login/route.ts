import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error"
      },
      { status: 500 }
    );
  }
}
