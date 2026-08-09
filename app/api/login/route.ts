import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err: unknown) {
    console.error("Login API error", err);

    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body"
      },
      { status: 400 }
    );
  }
}
