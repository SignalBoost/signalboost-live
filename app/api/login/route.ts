import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err) {
    console.error("Login API error", err);

    const isMalformedJson = err instanceof SyntaxError;

    return NextResponse.json(
      {
        success: false,
        error: isMalformedJson ? "Invalid request body" : "Internal server error"
      },
      { status: isMalformedJson ? 400 : 500 }
    );
  }
}
