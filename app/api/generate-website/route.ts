import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 4096;
const MAX_BUSINESS_NAME_LENGTH = 100;
const DEFAULT_BUSINESS_NAME = "Generated Website";

class RequestError extends Error {
  status: number;
  clientMessage: string;

  constructor(clientMessage: string, status: number) {
    super(clientMessage);
    this.name = "RequestError";
    this.status = status;
    this.clientMessage = clientMessage;
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

async function parseJsonBody(req: Request): Promise<unknown> {
  const contentLengthHeader = req.headers.get("content-length");

  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);

    if (!Number.isInteger(contentLength) || contentLength < 0) {
      throw new RequestError("Invalid request body.", 400);
    }

    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      throw new RequestError("Request body is too large.", 413);
    }
  }

  if (!req.body) {
    throw new RequestError("Invalid request body.", 400);
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      receivedBytes += value.byteLength;

      if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError("Request body is too large.", 413);
      }

      chunks.push(value);
    }
  }

  const bodyBytes = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    throw new RequestError("Invalid request body.", 400);
  }
}

function validateBusinessNameBody(body: unknown): string {
  if (!isPlainObject(body)) {
    throw new RequestError("Invalid request body.", 400);
  }

  const keys = Object.keys(body);

  if (keys.length !== 1 || keys[0] !== "businessName") {
    throw new RequestError("Invalid request body.", 400);
  }

  const businessName = body.businessName;

  if (
    typeof businessName !== "string" ||
    businessName.length > MAX_BUSINESS_NAME_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(businessName)
  ) {
    throw new RequestError("Invalid businessName.", 400);
  }

  return businessName;
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody(req);
    const businessName = validateBusinessNameBody(body);
    const escapedBusinessName = escapeHtml(businessName || DEFAULT_BUSINESS_NAME);

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
    if (err instanceof RequestError) {
      return NextResponse.json(
        {
          success: false,
          error: err.clientMessage
        },
        { status: err.status }
      );
    }

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
