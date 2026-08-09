import { NextResponse } from "next/server";

const MAX_CONTENT_LENGTH = 10 * 1024;
const MAX_BUSINESS_NAME_LENGTH = 100;

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type");
    if (!contentType?.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        {
          success: false,
          error: "Content-Type must be application/json"
        },
        { status: 415 }
      );
    }

    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const parsedLength = Number(contentLength);
      if (!Number.isFinite(parsedLength) || parsedLength > MAX_CONTENT_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            error: "Request body is too large"
          },
          { status: 413 }
        );
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body"
        },
        { status: 400 }
      );
    }

    if (!isPlainObject(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const keys = Object.keys(body);
    if (keys.length !== 1 || !keys.includes("businessName")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    if (typeof body.businessName !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "businessName must be a string"
        },
        { status: 400 }
      );
    }

    const businessName = body.businessName.trim();
    if (businessName.length === 0 || businessName.length > MAX_BUSINESS_NAME_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: "businessName must be between 1 and 100 characters"
        },
        { status: 400 }
      );
    }

    const escapedBusinessName = escapeHtml(businessName);

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${escapedBusinessName}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: unknown) {
    console.error("Failed to generate website", err);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error"
      },
      { status: 500 }
    );
  }
}
