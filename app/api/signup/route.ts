import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Signup API working"
    });
  } catch (err: unknown) {
    console.error("Signup API error:", err);

    const isMalformedJson = err instanceof SyntaxError;

    return NextResponse.json(
      {
        success: false,
        error: isMalformedJson ? "Malformed JSON request body" : "Internal server error"
      },
      { status: isMalformedJson ? 400 : 500 }
    );
  }
}
