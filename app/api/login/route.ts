import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    console.error("Login API error", err);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to process login request"
      },
      { status: 500 }
    );
  }
}
