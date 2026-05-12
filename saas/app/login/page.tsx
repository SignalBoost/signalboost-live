"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05070b",
        color: "white",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#111722",
          padding: "32px",
          borderRadius: "20px",
        }}
      >
        <h1
          style={{
            color: "#FFD700",
            marginBottom: "24px",
          }}
        >
          Login
        </h1>

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={input}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={input}
        />

        <button onClick={handleLogin} style={button}>
          Login
        </button>

        <p style={{ marginTop: "20px", color: "#999" }}>
          No account? <a href="/signup">Create one</a>
        </p>
      </div>
    </main>
  );
}

const input = {
  width: "100%",
  padding: "14px",
  marginBottom: "14px",
  borderRadius: "10px",
  border: "1px solid #333",
  background: "#0b111a",
  color: "white",
};

const button = {
  width: "100%",
  padding: "14px",
  borderRadius: "10px",
  border: 0,
  background: "#FFD700",
  color: "#000",
  fontWeight: "bold",
  cursor: "pointer",
};
