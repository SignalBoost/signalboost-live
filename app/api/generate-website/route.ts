import { NextResponse } from "next/server";

const MAX_BUSINESS_NAME_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character]);
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body"
        },
        { status: 400 }
      );
    }

    const rawBusinessName = body.businessName;

    if (rawBusinessName !== undefined && typeof rawBusinessName !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid businessName"
        },
        { status: 400 }
      );
    }

    if (
      typeof rawBusinessName === "string" &&
      (rawBusinessName.length > MAX_BUSINESS_NAME_LENGTH ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(rawBusinessName))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid businessName"
        },
        { status: 400 }
      );
    }

    const businessName = rawBusinessName || "Generated Website";

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${escapeHtml(businessName)}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: unknown) {
    console.error("Failed to generate website", err);

    return NextResponse.json(
      {
        success: false,
        error: err instanceof SyntaxError ? "Invalid JSON request body" : "Failed to generate website"
      },
      { status: err instanceof SyntaxError ? 400 : 500 }
    );
  }
}
