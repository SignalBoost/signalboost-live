import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err: unknown) {
    console.error("Login API request failed", err);

    return NextResponse.json(
      {
        success: false,
        error: err instanceof SyntaxError ? "Invalid request body" : "Internal server error"
      },
      { status: err instanceof SyntaxError ? 400 : 500 }
    );
  }
}
