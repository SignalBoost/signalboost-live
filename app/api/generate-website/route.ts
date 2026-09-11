import { NextResponse } from "next/server";

const MAX_BUSINESS_NAME_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  return value.replace(/[&<>"']/g, (char) => replacements[char]);
}

export async function POST(req: Request) {
  try {
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

    if (typeof rawBusinessName === "string" && rawBusinessName.length > MAX_BUSINESS_NAME_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: "businessName is too long"
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
        error: "Failed to generate website"
      },
      { status: 500 }
    );
  }
}
