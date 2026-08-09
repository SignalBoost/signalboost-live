import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 10_240; // 10 KB

interface SignupBody {
  email: string;
  password: string;
  [key: string]: unknown;
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length < 3 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > 128) return false;
  return true;
}

export async function POST(req: Request) {
  // Reject oversized bodies before parsing
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
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

  const { email, password } = body as SignupBody;

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

  // Only the allowlisted, validated fields are used going forward.
  // Raw body is never echoed back to the client.
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Placeholder for actual signup logic (e.g. database insert, email verification trigger)
    // using normalizedEmail and password.
    void normalizedEmail;

    return NextResponse.json({
      success: true,
      message: "Signup received"
    });
  } catch {
    console.error("Signup error");
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
