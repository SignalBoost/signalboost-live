import { NextResponse } from "next/server";

const MAX_BODY_LENGTH = 10_000;

interface SignupBody {
  email: string;
  password: string;
  [key: string]: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function validateBody(body: unknown): { valid: true; data: SignupBody } | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const obj = body as Record<string, unknown>;

  // Allowlist of known fields; reject unexpected top-level keys
  const allowedKeys = new Set(["email", "password", "name", "invitationCode"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Unexpected field: ${key}` };
    }
  }

  // email
  if (!isString(obj.email) || obj.email.length === 0) {
    return { valid: false, error: "email is required and must be a string" };
  }
  if (obj.email.length > 254) {
    return { valid: false, error: "email exceeds maximum length" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(obj.email)) {
    return { valid: false, error: "email is not a valid email address" };
  }

  // password
  if (!isString(obj.password) || obj.password.length === 0) {
    return { valid: false, error: "password is required and must be a string" };
  }
  if (obj.password.length < 8) {
    return { valid: false, error: "password must be at least 8 characters" };
  }
  if (obj.password.length > 128) {
    return { valid: false, error: "password exceeds maximum length" };
  }

  // optional name
  if (obj.name !== undefined) {
    if (!isString(obj.name) || obj.name.length > 200) {
      return { valid: false, error: "name must be a string of at most 200 characters" };
    }
  }

  // optional invitationCode
  if (obj.invitationCode !== undefined) {
    if (!isString(obj.invitationCode) || obj.invitationCode.length > 512) {
      return { valid: false, error: "invitationCode must be a string of at most 512 characters" };
    }
  }

  return { valid: true, data: obj as SignupBody };
}

export async function POST(req: Request) {
  try {
    // Guard against oversized bodies before parsing
    const contentLength = req.headers.get("content-length");
    if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_LENGTH) {
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

    const validation = validateBody(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Do not echo back the parsed body; return only non-sensitive confirmation
    return NextResponse.json({
      success: true,
      message: "Signup received"
    });
  } catch (err: unknown) {
    // Log internally; do not expose raw error details to the client
    console.error("[signup] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
