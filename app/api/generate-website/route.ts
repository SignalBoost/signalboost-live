import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 1024;
const MAX_BUSINESS_NAME_LENGTH = 100;

type ValidatedBody = {
  businessName?: string;
};

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

async function readRequestBody(req: Request, maxBytes: number) {
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

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(receivedBytes);
  let position = 0;

  for (const chunk of chunks) {
    body.set(chunk, position);
    position += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function validateRequestBody(body: unknown): ValidatedBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (Object.keys(record).some((key) => key !== "businessName")) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(record, "businessName")) {
    return {};
  }

  const businessName = record.businessName;

  if (typeof businessName !== "string") {
    return null;
  }

  if (businessName.length > MAX_BUSINESS_NAME_LENGTH || /[\u0000-\u001F\u007F]/.test(businessName)) {
    return null;
  }

  return { businessName };
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        {
          success: false,
          error: "Content-Type must be application/json."
        },
        { status: 415 }
      );
    }

    const contentLength = req.headers.get("content-length");

    if (contentLength) {
      const parsedContentLength = Number(contentLength);

      if (!Number.isFinite(parsedContentLength) || parsedContentLength < 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid Content-Length."
          },
          { status: 400 }
        );
      }

      if (parsedContentLength > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: "Request body is too large."
          },
          { status: 413 }
        );
      }
    }

    const rawBody = await readRequestBody(req, MAX_REQUEST_BODY_BYTES);

    if (rawBody === null) {
      return NextResponse.json(
        {
          success: false,
          error: "Request body is too large."
        },
        { status: 413 }
      );
    }

    let parsedBody: unknown;

    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body."
        },
        { status: 400 }
      );
    }

    const body = validateRequestBody(parsedBody);

    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body."
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
        error: "Unable to generate website."
      },
      { status: 500 }
    );
  }
}
