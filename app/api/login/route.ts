import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body"
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Login API working"
  });
}
