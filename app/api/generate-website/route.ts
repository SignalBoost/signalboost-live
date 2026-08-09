import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_SIZE_BYTES = 1024;
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
      default:
        return "&#39;";
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRequestBody(req: Request) {
  const reader = req.body?.getReader();

  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > MAX_REQUEST_BODY_SIZE_BYTES) {
      return null;
    }

    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bodyBytes);
}

export async function POST(req: Request) {
  try {
    const contentLengthHeader = req.headers.get("content-length");

    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);

      if (!Number.isInteger(contentLength) || contentLength < 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request body"
          },
          { status: 400 }
        );
      }

      if (contentLength > MAX_REQUEST_BODY_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: "Request body too large"
          },
          { status: 413 }
        );
      }
    }

    const rawBody = await readRequestBody(req);

    if (rawBody === null) {
      return NextResponse.json(
        {
          success: false,
          error: "Request body too large"
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

    if (!isPlainObject(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const businessNameValue = body.businessName;

    if (businessNameValue !== undefined && typeof businessNameValue !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    if (
      businessNameValue !== undefined &&
      businessNameValue.length > MAX_BUSINESS_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const businessName = businessNameValue || "Generated Website";

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
