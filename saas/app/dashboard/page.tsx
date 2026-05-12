"use client";

import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <section
      style={{
        padding: "40px",
        background: "#05070b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "40px",
        }}
      >
        <h1
          style={{
            fontSize: "48px",
            color: "#FFD700",
          }}
        >
          Dashboard
        </h1>

        <button
          onClick={logout}
          style={{
            padding: "12px 18px",
            borderRadius: "10px",
            border: 0,
            background: "#FFD700",
            color: "#000",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      <div
        style={{
          background: "#111722",
          padding: "30px",
          borderRadius: "20px",
        }}
      >
        <h2
          style={{
            marginBottom: "12px",
          }}
        >
          Welcome to SignalBoost
        </h2>

        <p
          style={{
            color: "#999",
          }}
        >
          Your AI marketing dashboard is ready.
        </p>
      </div>
    </section>
  );
}
