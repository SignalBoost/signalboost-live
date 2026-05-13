"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/auth");
        return;
      }

      setLoading(false);
    };

    checkSession();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070a0f]">
        <div className="animate-pulse font-bold text-yellow-400">
          Loading SignalBoost...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
