import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    return NextResponse.json({
      success: true,
      html: `
        <section style="padding:40px;font-family:sans-serif">
          <h1>${body.businessName || "Generated Website"}</h1>
          <p>AI generated website preview.</p>
        </section>
      `
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}
