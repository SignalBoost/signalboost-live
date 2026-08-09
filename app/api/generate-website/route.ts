import { NextResponse } from "next/server";

const MAX_BUSINESS_NAME_LENGTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
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

    const businessNameValue = body.businessName;

    if (
      businessNameValue !== undefined &&
      (typeof businessNameValue !== "string" ||
        businessNameValue.length > MAX_BUSINESS_NAME_LENGTH)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid businessName"
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
