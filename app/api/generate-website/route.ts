import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 4096;
const MAX_BUSINESS_NAME_LENGTH = 100;
const ALLOWED_BODY_KEYS = new Set(["businessName"]);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");

    if (contentLength) {
      const parsedContentLength = Number(contentLength);

      if (
        !Number.isFinite(parsedContentLength) ||
        parsedContentLength < 0 ||
        parsedContentLength > MAX_REQUEST_BODY_BYTES
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Request body is too large."
          },
          { status: 413 }
        );
      }
    }

    const rawBody = await req.text();
    const rawBodyBytes = new TextEncoder().encode(rawBody).length;

    if (rawBodyBytes > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: "Request body is too large."
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
          error: "Invalid request body."
        },
        { status: 400 }
      );
    }

    if (!isJsonObject(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body."
        },
        { status: 400 }
      );
    }

    if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body."
        },
        { status: 400 }
      );
    }

    if (
      body.businessName !== undefined &&
      (typeof body.businessName !== "string" ||
        body.businessName.length > MAX_BUSINESS_NAME_LENGTH)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid businessName."
        },
        { status: 400 }
      );
    }

    const businessName = escapeHtml(body.businessName || "Generated Website");

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${businessName}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err) {
    console.error("Failed to generate website", err);

    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred."
      },
      { status: 500 }
    );
  }
}
