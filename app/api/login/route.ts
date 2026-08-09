import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err) {
    const isMalformedJson = err instanceof SyntaxError;

    return NextResponse.json(
      {
        success: false,
        error: isMalformedJson ? "Invalid request body" : "Unable to process login request"
      },
      { status: isMalformedJson ? 400 : 500 }
    );
  }
}
