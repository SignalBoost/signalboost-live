import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 16_384; // 16 KB

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
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

    const raw = body as Record<string, unknown>;

    // Allowlist: only accept known fields
    const allowedKeys = new Set(["email", "password", "name"]);
    const unknownKeys = Object.keys(raw).filter((k) => !allowedKeys.has(k));
    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { success: false, error: "Unexpected fields in request" },
        { status: 400 }
      );
    }

    const { email, password, name } = raw;

    // email: required, string, valid format, max length
    if (!isString(email) || email.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "email is required" },
        { status: 400 }
      );
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    // password: required, string, length policy
    if (!isString(password) || password.length === 0) {
      return NextResponse.json(
        { success: false, error: "password is required" },
        { status: 400 }
      );
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { success: false, error: "password must be between 8 and 128 characters" },
        { status: 400 }
      );
    }

    // name: optional, string, max length
    if (name !== undefined) {
      if (!isString(name) || name.length > 200) {
        return NextResponse.json(
          { success: false, error: "Invalid name" },
          { status: 400 }
        );
      }
    }

    // Return only non-sensitive confirmation data
    return NextResponse.json({
      success: true,
      message: "Signup API working"
    });
  } catch (err: unknown) {
    // Log the error server-side only; do not expose internals to the client
    console.error("[signup] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
