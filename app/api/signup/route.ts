import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 16 * 1024; // 16 KB

interface SignupBody {
  email: string;
  password: string;
  [key: string]: unknown;
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length < 3 || email.length > 254) return false;
  // Basic RFC-compliant email pattern
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string") return false;
  // At least 8 characters, max 128
  return password.length >= 8 && password.length <= 128;
}

export async function POST(req: Request) {
  try {
    // Enforce a maximum body size before parsing
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 413 }
      );
    }

    let body: SignupBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Allowlist validation — reject unexpected or missing fields
    const allowedKeys = new Set(["email", "password"]);
    const bodyKeys = Object.keys(body);
    for (const key of bodyKeys) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json(
          { success: false, error: "Invalid request body" },
          { status: 400 }
        );
      }
    }

    // Required field presence
    if (!Object.prototype.hasOwnProperty.call(body, "email") ||
        !Object.prototype.hasOwnProperty.call(body, "password")) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: email, password" },
        { status: 400 }
      );
    }

    // Type, format, and length validation
    if (!isValidEmail(body.email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (!isValidPassword(body.password)) {
      return NextResponse.json(
        { success: false, error: "Password must be between 8 and 128 characters" },
        { status: 400 }
      );
    }

    // Normalize email (lowercase)
    const normalizedEmail = body.email.trim().toLowerCase();

    // TODO: pass normalizedEmail (and hashed password) to signup logic here
    void normalizedEmail;

    // Return only non-sensitive confirmation — never echo input
    return NextResponse.json({
      success: true,
      message: "Signup received"
    });
  } catch {
    // Log server-side detail without exposing it to the client
    console.error("Unexpected error in POST /api/signup");
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
