import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_LENGTH = 2048;
const MAX_BUSINESS_NAME_LENGTH = 100;
const INVALID_REQUEST_ERROR = "Invalid request body.";

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

function invalidRequest() {
  return NextResponse.json(
    {
      success: false,
      error: INVALID_REQUEST_ERROR
    },
    { status: 400 }
  );
}

function requestTooLarge() {
  return NextResponse.json(
    {
      success: false,
      error: "Request body too large."
    },
    { status: 413 }
  );
}

export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");

    if (contentLength !== null) {
      const parsedContentLength = Number(contentLength);

      if (
        !Number.isFinite(parsedContentLength) ||
        parsedContentLength > MAX_REQUEST_BODY_LENGTH
      ) {
        return requestTooLarge();
      }
    }

    const rawBody = await req.text();

    if (rawBody.length > MAX_REQUEST_BODY_LENGTH) {
      return requestTooLarge();
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return invalidRequest();
    }

    if (!isPlainObject(body)) {
      return invalidRequest();
    }

    const keys = Object.keys(body);

    if (keys.length !== 1 || keys[0] !== "businessName") {
      return invalidRequest();
    }

    const businessName = body.businessName;

    if (
      typeof businessName !== "string" ||
      businessName.length > MAX_BUSINESS_NAME_LENGTH ||
      /[\u0000-\u001F\u007F]/.test(businessName)
    ) {
      return invalidRequest();
    }

    const escapedBusinessName = escapeHtml(
      businessName.length > 0 ? businessName : "Generated Website"
    );

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
    console.error("Failed to generate website preview", err);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to generate website."
      },
      { status: 500 }
    );
  }
}
