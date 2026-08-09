import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_LENGTH = 4096;
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

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonError("Content-Type must be application/json", 415);
    }

    const contentLength = req.headers.get("content-length");
    if (contentLength !== null) {
      const parsedLength = Number(contentLength);
      if (
        !Number.isSafeInteger(parsedLength) ||
        parsedLength < 0 ||
        parsedLength > MAX_REQUEST_BODY_LENGTH
      ) {
        return jsonError("Request body is too large", 413);
      }
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_REQUEST_BODY_LENGTH) {
      return jsonError("Request body is too large", 413);
    }

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return jsonError("Invalid JSON request body", 400);
    }

    if (!isPlainObject(body)) {
      return jsonError("Invalid request body", 400);
    }

    const allowedKeys = new Set(["businessName"]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      return jsonError("Invalid request body", 400);
    }

    const rawBusinessName = body.businessName;
    if (rawBusinessName !== undefined && typeof rawBusinessName !== "string") {
      return jsonError("businessName must be a string", 400);
    }

    if (
      typeof rawBusinessName === "string" &&
      (rawBusinessName.length > MAX_BUSINESS_NAME_LENGTH || /[\u0000-\u001F\u007F]/.test(rawBusinessName))
    ) {
      return jsonError("businessName is invalid", 400);
    }

    const businessName = escapeHtml(rawBusinessName || "Generated Website");

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
        error: "Unable to generate website"
      },
      { status: 500 }
    );
  }
}
