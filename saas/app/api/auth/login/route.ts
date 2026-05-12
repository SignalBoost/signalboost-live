import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const supabase = createRouteHandlerClient({
      cookies,
    });

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      return Response.json(
        {
          success: false,
          error: error.message,
        },
        { status: 401 }
      );
    }

    return Response.json({
      success: true,
      redirect: "/dashboard",
    });
  } catch {
    return Response.json(
      {
        success: false,
        error: "Login failed",
      },
      { status: 500 }
    );
  }
}
