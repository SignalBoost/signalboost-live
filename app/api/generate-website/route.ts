import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 1024;
const MAX_BUSINESS_NAME_LENGTH = 100;

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

function invalidRequest() {
  return NextResponse.json(
    {
      success: false,
      error: "Invalid request body"
    },
    { status: 400 }
  );
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return invalidRequest();
    }

    const contentLength = req.headers.get("content-length");

    if (contentLength !== null) {
      const parsedContentLength = Number(contentLength);

      if (
        !Number.isFinite(parsedContentLength) ||
        parsedContentLength < 0 ||
        parsedContentLength > MAX_REQUEST_BODY_BYTES
      ) {
        return invalidRequest();
      }
    }

    const rawBody = await req.text();

    if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BODY_BYTES) {
      return invalidRequest();
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return invalidRequest();
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return invalidRequest();
    }

    const payload = body as Record<string, unknown>;
    const payloadKeys = Object.keys(payload);

    if (payloadKeys.some((key) => key !== "businessName")) {
      return invalidRequest();
    }

    if (
      payload.businessName !== undefined &&
      typeof payload.businessName !== "string"
    ) {
      return invalidRequest();
    }

    if (
      typeof payload.businessName === "string" &&
      payload.businessName.length > MAX_BUSINESS_NAME_LENGTH
    ) {
      return invalidRequest();
    }

    const businessName = payload.businessName || "Generated Website";

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${escapeHtml(businessName)}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err) {
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
