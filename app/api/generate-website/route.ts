import { NextResponse } from "next/server";

const MAX_BUSINESS_NAME_LENGTH = 100;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
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
    const body = await req.json();

    if (!isRecord(body) || Object.keys(body).length !== 1) {
      return invalidRequest();
    }

    const businessName = body.businessName;

    if (
      typeof businessName !== "string" ||
      businessName.length > MAX_BUSINESS_NAME_LENGTH ||
      CONTROL_CHARACTERS.test(businessName)
    ) {
      return invalidRequest();
    }

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${escapeHtml(businessName || "Generated Website")}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: unknown) {
    console.error("Failed to generate website preview", err);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to generate website preview"
      },
      { status: 500 }
    );
  }
}
