import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err: unknown) {
    const isMalformedJson = err instanceof SyntaxError;

    return NextResponse.json(
      {
        success: false,
        error: isMalformedJson ? "Invalid request body" : "An unexpected error occurred"
      },
      { status: isMalformedJson ? 400 : 500 }
    );
  }
}
