import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();

    return NextResponse.json({
      success: true,
      message: "Login API working"
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unable to process request"
      },
      { status: 500 }
    );
  }
}
