import { NextResponse } from "next/server";

const MAX_BODY_LENGTH = 10_000;

interface SignupBody {
  email: string;
  password: string;
  [key: string]: unknown;
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length < 3 || email.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > 128) return false;
  return true;
}

export async function POST(req: Request) {
  // Reject oversized bodies early
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { success: false, error: "Request body too large" },
      { status: 413 }
    );
  }

  let body: SignupBody;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 413 }
      );
    }
    body = JSON.parse(raw) as SignupBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    // Validate required fields — allowlist only known fields
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { email, password } = body;

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "A valid email address is required" },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        { success: false, error: "Password must be between 8 and 128 characters" },
        { status: 400 }
      );
    }

    // Only safe, non-sensitive data is returned — never echo back passwords or tokens
    return NextResponse.json({
      success: true,
      message: "Signup API working"
    });
  } catch {
    // Log error server-side only; return generic message to client
    console.error("Signup route unexpected error");
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
