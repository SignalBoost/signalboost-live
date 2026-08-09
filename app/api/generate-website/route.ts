import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 10 * 1024;
const MAX_BUSINESS_NAME_LENGTH = 100;

class RequestValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

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

function validateBusinessNameBody(body: unknown) {
  if (!isPlainObject(body) || Object.keys(body).length !== 1) {
    throw new RequestValidationError("Invalid request body");
  }

  if (typeof body.businessName !== "string") {
    throw new RequestValidationError("Invalid request body");
  }

  if (body.businessName.length > MAX_BUSINESS_NAME_LENGTH) {
    throw new RequestValidationError("Invalid request body");
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body.businessName)) {
    throw new RequestValidationError("Invalid request body");
  }

  return body.businessName;
}

export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");

    if (contentLength) {
      const parsedContentLength = Number(contentLength);

      if (Number.isFinite(parsedContentLength) && parsedContentLength > MAX_REQUEST_BODY_BYTES) {
        throw new RequestValidationError("Request body too large", 413);
      }
    }

    const rawBody = await req.text();

    if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BODY_BYTES) {
      throw new RequestValidationError("Request body too large", 413);
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new RequestValidationError("Invalid JSON request body");
    }

    const businessName = validateBusinessNameBody(body);
    const heading = escapeHtml(businessName || "Generated Website");

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${heading}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: unknown) {
    if (err instanceof RequestValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: err.message
        },
        { status: err.status }
      );
    }

    console.error("Failed to generate website", err);

    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred"
      },
      { status: 500 }
    );
  }
}
