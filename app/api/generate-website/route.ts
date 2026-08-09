import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 1024;
const MAX_BUSINESS_NAME_LENGTH = 100;
const DEFAULT_BUSINESS_NAME = "Generated Website";

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

export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");

    if (contentLength !== null) {
      const parsedContentLength = Number(contentLength);

      if (
        !Number.isFinite(parsedContentLength) ||
        parsedContentLength < 0 ||
        parsedContentLength > MAX_REQUEST_BODY_BYTES
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Request body is too large"
          },
          { status: 413 }
        );
      }
    }

    const rawBody = await req.text();

    if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BODY_BYTES) {
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
          error: "Invalid JSON request body"
        },
        { status: 400 }
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const keys = Object.keys(body);

    if (keys.some((key) => key !== "businessName")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const businessName = (body as { businessName?: unknown }).businessName;

    if (businessName !== undefined && typeof businessName !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid businessName"
        },
        { status: 400 }
      );
    }

    if (
      businessName !== undefined &&
      businessName.length > MAX_BUSINESS_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "businessName is too long"
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${escapeHtml(businessName || DEFAULT_BUSINESS_NAME)}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: unknown) {
    console.error("Failed to generate website preview", err);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to generate website preview"
      },
      { status: 500 }
    );
  }
}
