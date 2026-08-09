import { NextResponse } from "next/server";

const MAX_REQUEST_BODY_BYTES = 4096;
const MAX_BUSINESS_NAME_LENGTH = 100;

class BadRequestError extends Error {}

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

async function readRequestBody(req: Request) {
  const contentLength = req.headers.get("content-length");

  if (contentLength !== null) {
    const parsedLength = Number(contentLength);

    if (!Number.isFinite(parsedLength) || parsedLength > MAX_REQUEST_BODY_BYTES) {
      throw new BadRequestError("Invalid request");
    }
  }

  if (!req.body) {
    return "";
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
        throw new BadRequestError("Invalid request");
      }

      chunks.push(value);
    }
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function validateBusinessName(body: unknown) {
  if (!isPlainObject(body)) {
    throw new BadRequestError("Invalid request");
  }

  const allowedKeys = new Set(["businessName"]);

  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw new BadRequestError("Invalid request");
    }
  }

  const businessName = body.businessName;

  if (businessName === undefined || businessName === null || businessName === "") {
    return "Generated Website";
  }

  if (typeof businessName !== "string") {
    throw new BadRequestError("Invalid request");
  }

  if (
    businessName.length > MAX_BUSINESS_NAME_LENGTH ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(businessName)
  ) {
    throw new BadRequestError("Invalid request");
  }

  return businessName;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new BadRequestError("Invalid request");
    }

    let body: unknown;

    try {
      body = JSON.parse(await readRequestBody(req));
    } catch (err) {
      if (err instanceof BadRequestError) {
        throw err;
      }

      throw new BadRequestError("Invalid request");
    }

    const businessName = escapeHtml(validateBusinessName(body));

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
        error: err instanceof BadRequestError ? "Invalid request" : "Unable to generate website"
      },
      { status: err instanceof BadRequestError ? 400 : 500 }
    );
  }
}
