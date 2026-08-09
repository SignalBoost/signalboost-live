import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_LENGTH = 2048;
const MAX_BUSINESS_NAME_LENGTH = 120;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    const contentLengthHeader = req.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);

    if (
      contentLength !== null &&
      (!Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_REQUEST_BODY_LENGTH)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Request body is too large"
        },
        { status: 413 }
      );
    }

    const rawBody = await req.text();

    if (rawBody.length > MAX_REQUEST_BODY_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: "Request body is too large"
        },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    if (
      !isPlainObject(body) ||
      !Object.keys(body).every((key) => key === "businessName") ||
      typeof body.businessName !== "string" ||
      body.businessName.length > MAX_BUSINESS_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const safeBusinessName = escapeHtml(body.businessName || "Generated Website");

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${safeBusinessName}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: unknown) {
    console.error("Failed to generate website preview", err);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error"
      },
      { status: 500 }
    );
  }
}
