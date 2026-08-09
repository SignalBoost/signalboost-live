import { NextResponse } from "next/server";

const ALLOWED_FIELDS = ["email", "password", "name"] as const;
type AllowedField = typeof ALLOWED_FIELDS[number];

const MAX_LENGTHS: Record<AllowedField, number> = {
  email: 254,
  password: 128,
  name: 100,
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isValidEmail(email: string): boolean {
  // Basic RFC-compatible email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  // Minimum 8 characters
  return password.length >= 8;
}

export async function POST(req: Request) {
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

  // Reject unexpected fields
  const extraFields = Object.keys(raw).filter(
    (k) => !(ALLOWED_FIELDS as readonly string[]).includes(k)
  );
  if (extraFields.length > 0) {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Validate required fields presence and types
  const { email, password, name } = raw as Partial<Record<AllowedField, unknown>>;

  if (!isString(email) || email.trim() === "") {
    return NextResponse.json(
      { success: false, error: "A valid email is required" },
      { status: 400 }
    );
  }

  if (!isString(password) || password === "") {
    return NextResponse.json(
      { success: false, error: "A password is required" },
      { status: 400 }
    );
  }

  // Length checks
  if (email.length > MAX_LENGTHS.email) {
    return NextResponse.json(
      { success: false, error: "Email address is too long" },
      { status: 400 }
    );
  }

  if (password.length > MAX_LENGTHS.password) {
    return NextResponse.json(
      { success: false, error: "Password is too long" },
      { status: 400 }
    );
  }

  if (name !== undefined) {
    if (!isString(name) || name.length > MAX_LENGTHS.name) {
      return NextResponse.json(
        { success: false, error: "Name is invalid or too long" },
        { status: 400 }
      );
    }
  }

  // Format checks
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json(
      { success: false, error: "A valid email is required" },
      { status: 400 }
    );
  }

  if (!isValidPassword(password)) {
    return NextResponse.json(
      { success: false, error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  try {
    // Placeholder for actual signup logic
    // Pass only validated, sanitized values — never echo raw input
    void normalizedEmail;
    void password;
    void name;

    return NextResponse.json({
      success: true,
      message: "Signup API working",
    });
  } catch {
    console.error("Signup error");
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
