import { NextResponse } from "next/server";

const MAX_BUSINESS_NAME_LENGTH = 200;

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    let businessName = "Generated Website";

    if (businessNameValue != null) {
      if (typeof businessNameValue !== "string") {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request body"
          },
          { status: 400 }
        );
      }

      if (businessNameValue.length > MAX_BUSINESS_NAME_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request body"
          },
          { status: 400 }
        );
      }

      businessName = businessNameValue || businessName;
    }

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
