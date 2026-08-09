import { NextResponse } from "next/server";

const MAX_BODY_LENGTH = 10_000;

interface SignupBody {
  email: string;
  password: string;
  [key: string]: unknown;
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > 128) return false;
  return true;
}

export async function POST(req: Request) {
  try {
    // Guard against oversized bodies by reading as text first.
    const raw = await req.text();
    if (raw.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 400 }
      );
    }

    let body: SignupBody;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

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
        {
          success: false,
          error:
            "Password must be between 8 and 128 characters"
        },
        { status: 400 }
      );
    }

    // Only the normalised, non-sensitive fields are used beyond this point.
    const normalizedEmail = email.trim().toLowerCase();

    // TODO: persist the new account using normalizedEmail and password.
    void normalizedEmail;

    return NextResponse.json({
      success: true,
      message: "Signup API working"
    });
  } catch {
    // Log full details server-side only; return a generic message to the client.
    console.error("Unexpected error in POST /api/signup");
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
